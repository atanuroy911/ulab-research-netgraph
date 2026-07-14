import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';

// Generates the method<->domain affinity table used by build-cross-domain-edges.mjs.
//
// v1 (Python, retired) asked the LLM to look at the whole ~600-term taxonomy at once and
// "pick ~50 interesting pairs" — which meant most terms got zero coverage; the model
// naturally gravitates to a handful of obvious combos (ML+Agriculture, etc.) rather than
// systematically reasoning about every domain. That's why the resulting graph was almost
// empty: two faculty only connect if BOTH their keywords happen to land in that small
// hand-picked set.
//
// v2 asks per-domain, exhaustively: "what are the probable applications of combining X
// with a different field?" for every single taxonomy term, in small batches. The model
// answers in free text (it doesn't have to copy a giant list verbatim, which was also a
// source of rejected/hallucinated pairs before) — its answer is then embedded and matched
// back to the nearest REAL taxonomy term by cosine similarity, the same nearest-neighbor
// trick canonicalize-keywords.mjs uses. This guarantees every domain gets considered, and
// keeps every accepted pair anchored to a term faculty can actually have.
//
// Usage: node scripts/build-domain-affinity.mjs [--batch-size 12] [--match-threshold 0.6] [--apps-per-domain 2]

const BASE_DIR = path.join(process.cwd(), '..');

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://192.168.123.47:11434/api/generate';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3:8b';

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 ? args[i + 1] : def;
};
const BATCH_SIZE = parseInt(getArg('batch-size', '12'), 10);
const MATCH_THRESHOLD = parseFloat(getArg('match-threshold', '0.60'));
const APPS_PER_DOMAIN = parseInt(getArg('apps-per-domain', '2'), 10);
// If the matched term is this similar (or more) to the origin domain, it's a near-synonym,
// not a different field — reject it as a cross-disciplinary pairing regardless of match score.
const DOMAIN_DISTINCT_CEILING = parseFloat(getArg('distinct-ceiling', '0.55'));
const TAXONOMY_FILE = getArg('taxonomy-file', path.join(BASE_DIR, 'data', 'taxonomy.json'));
const OUTPUT_FILE = getArg('output-file', path.join(BASE_DIR, 'data', 'domain_affinity.json'));

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildPrompt(domains, appsPerDomain) {
  // Bullets, not numbers — a numbered list invites the model to echo "1. Animation"
  // back as the domain value instead of just "Animation" (handled defensively in the
  // parser too, but avoiding it at the source means fewer entries need that fallback).
  const list = domains.map((d) => `- ${d}`).join('\n');
  return `You are helping a university identify interdisciplinary research collaboration
opportunities between faculty in DIFFERENT departments.

For EACH of the following research domains, answer: what are the most probable
applications of combining this domain with expertise from a genuinely DIFFERENT field
(never a near-synonym or the same field reworded)? Think concretely — e.g. combining
"Machine Learning" with "Linguistics" enables computational linguistics/NLP; combining
"IoT" with "Flood Control" enables environmental sensing networks.

For each domain, propose exactly ${appsPerDomain} such applications. You do not need to
match any master list — just name the other field naturally.

Domains:
${list}

Return ONLY a JSON array with exactly one entry per input domain, in this shape:
[
  {"domain": "<exact domain from the list above, without the leading "-">", "applications": [
    {"field": "<the other field, plain text>", "rationale": "<one concrete sentence>"}
  ]}
]`;
}

async function callOllama(prompt) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      keep_alive: -1,
      options: { num_ctx: 8192 },
    }),
  });
  if (!res.ok) {
    console.log(`  Ollama HTTP error ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return [];
  }
  const data = await res.json();
  let content = data.response || '';

  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    content = fence[1].trim();
  } else {
    const arr = content.match(/\[[\s\S]*\]/);
    content = arr ? arr[0].trim() : content.trim();
  }
  if (!content) return [];
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.log(`  Failed to parse LLM response as JSON: ${e.message}`);
    return [];
  }
}

async function main() {
  if (!fs.existsSync(TAXONOMY_FILE)) {
    console.log(`Taxonomy file not found at ${TAXONOMY_FILE}. Run canonicalize-keywords first.`);
    return;
  }
  const taxonomy = JSON.parse(fs.readFileSync(TAXONOMY_FILE, 'utf8'));
  const terms = Object.keys(taxonomy).sort();
  console.log(`Loaded ${terms.length} canonical terms. Batch size ${BATCH_SIZE}, match threshold ${MATCH_THRESHOLD}, ${APPS_PER_DOMAIN} applications/domain.`);
  console.log(`This will make ~${Math.ceil(terms.length / BATCH_SIZE)} LLM calls — may take several minutes.`);

  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const embed = async (text) => {
    const out = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(out.data);
  };

  // Embed every taxonomy term once, up front, so matching free-text answers back to it
  // is just a similarity lookup, not another LLM call.
  console.log('Embedding taxonomy...');
  const termEmbeddings = new Map();
  for (const t of terms) {
    termEmbeddings.set(t, await embed(t));
  }

  const seen = new Set();
  const affinities = [];
  let matched = 0, unmatched = 0;

  const batches = [];
  for (let i = 0; i < terms.length; i += BATCH_SIZE) batches.push(terms.slice(i, i + BATCH_SIZE));

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    console.log(`Batch ${b + 1}/${batches.length} (${batch.length} domains)...`);
    const prompt = buildPrompt(batch, APPS_PER_DOMAIN);
    let results = await callOllama(prompt);
    if (results.length === 0) {
      // A malformed/truncated generation happens occasionally (non-deterministic sampling)
      // and would otherwise silently zero out this whole batch's yield — one retry recovers
      // most of those without meaningfully slowing the overall run down.
      console.log('  Empty/invalid response, retrying once...');
      results = await callOllama(prompt);
    }
    if (process.env.DEBUG_AFFINITY) console.log('  DEBUG results:', JSON.stringify(results).slice(0, 500));

    for (const entry of results) {
      if (!entry || typeof entry !== 'object') continue;
      // Model sometimes echoes the list marker too ("1. Animation" or "- Animation"
      // instead of "Animation") — strip a leading marker before matching.
      const domainRaw = String(entry.domain || '').trim().replace(/^(\d+\.|-)\s*/, '');
      const domainNorm = domainRaw.toLowerCase();
      const domain = batch.find((t) => t.toLowerCase() === domainNorm);
      if (!domain) continue;

      for (const app of entry.applications || []) {
        const field = String(app?.field || '').trim();
        const rationale = String(app?.rationale || '').trim();
        if (!field || !rationale) continue;

        const fieldEmbedding = await embed(field);
        const domainEmbedding = termEmbeddings.get(domain);
        let best = null, bestScore = -1;
        for (const [term, emb] of termEmbeddings) {
          if (term === domain) continue; // never match a domain to itself
          // The whole point is DIFFERENT fields — if the candidate match is itself a
          // near-synonym of the origin domain (e.g. "Art Studies" for a "Painting"
          // domain proposing "art history"), that's not a cross-disciplinary pairing,
          // it's the canonicalization problem again. Skip it regardless of how well it
          // matches the model's free-text answer.
          if (cosineSimilarity(domainEmbedding, emb) >= DOMAIN_DISTINCT_CEILING) continue;
          const score = cosineSimilarity(fieldEmbedding, emb);
          if (score > bestScore) { bestScore = score; best = term; }
        }

        if (best && bestScore >= MATCH_THRESHOLD) {
          matched++;
          const key = [domain, best].sort().join('|').toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const [a, b2] = [domain, best].sort();
          affinities.push({ a, b: b2, rationale });
        } else {
          unmatched++;
        }
      }
    }
  }

  console.log(`Done. ${affinities.length} unique affinity pairs (${matched} matched above threshold, ${unmatched} discarded — no close-enough existing taxonomy term).`);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(affinities, null, 2), 'utf8');
  console.log(`Wrote ${OUTPUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
