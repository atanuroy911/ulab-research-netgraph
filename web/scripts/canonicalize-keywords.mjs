import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';

// Replaces free-form LLM canonicalization with a deterministic embedding-nearest-neighbor
// lookup against a growing controlled vocabulary. The LLM is still responsible for
// extracting candidate phrases (term) and a first-pass canonical guess in
// extract_keywords.py, but the *final* canonical label a keyword gets is decided here by
// cosine similarity against existing taxonomy entries, not by another generation step.
// This is what actually fixes low keyword overlap: everyone gets pulled toward the same
// small vocabulary instead of each LLM call inventing its own phrasing.
//
// Usage: node scripts/canonicalize-keywords.mjs [--threshold 0.72] [--dry-run]

const BASE_DIR = path.join(process.cwd(), '..');
const FACULTY_DIR = path.join(BASE_DIR, 'data', 'faculty');
const TAXONOMY_FILE = path.join(BASE_DIR, 'data', 'taxonomy.json');
const INDEX_FILE = path.join(BASE_DIR, 'data', 'index.json');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const thresholdArg = args.indexOf('--threshold');
const THRESHOLD = thresholdArg !== -1 ? parseFloat(args[thresholdArg + 1]) : 0.72;
// The existing taxonomy.json is itself a near-1:1 dump of raw terms (build_taxonomy.py
// never actually clustered anything — see history). Seeding the vocabulary from it means
// every candidate trivially "matches" its own already-fragmented near-duplicate entry
// instead of genuinely reclustering. --reset ignores it and rebuilds from scratch.
const reset = args.includes('--reset');
const verbose = args.includes('--verbose');

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

function getCanonicalGuess(k) {
  return (k.canonical || k.term || '').trim();
}

async function main() {
  console.log(`Canonicalizing keywords (threshold=${THRESHOLD}${dryRun ? ', dry run' : ''})...`);
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const embed = async (text) => {
    const out = await extractor(text, { pooling: 'mean', normalize: true });
    return Array.from(out.data);
  };

  // Seed the vocabulary from the existing taxonomy so prior manual curation isn't
  // discarded, then let it grow with new canonical entries as we go — unless --reset,
  // since the existing taxonomy is itself unclustered (see comment above).
  const existingTaxonomy = (!reset && fs.existsSync(TAXONOMY_FILE))
    ? JSON.parse(fs.readFileSync(TAXONOMY_FILE, 'utf8'))
    : {};

  const vocab = []; // [{ canonical, embedding }]
  const synonyms = new Map(); // canonical -> Set of raw terms seen
  for (const canonical of Object.keys(existingTaxonomy)) {
    const emb = await embed(canonical);
    vocab.push({ canonical, embedding: emb });
    synonyms.set(canonical, new Set(existingTaxonomy[canonical] || []));
  }
  console.log(`Seeded vocabulary with ${vocab.length} existing canonical terms.${reset ? ' (--reset: none, rebuilding from scratch)' : ''}`);

  const files = fs.readdirSync(FACULTY_DIR).filter((f) => f.endsWith('.json') && f !== 'example.json');

  let renamed = 0, kept = 0, minted = 0, skippedLocked = 0;

  for (const filename of files) {
    const filePath = path.join(FACULTY_DIR, filename);
    const fac = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if ((fac.locked_fields || []).includes('extracted_keywords')) {
      skippedLocked++;
      continue;
    }

    const keywords = fac.extracted_keywords || [];
    if (keywords.length === 0) continue;

    // Higher-weight (more prominent) keywords are processed first so they become the
    // vocabulary anchors that lower-confidence variants merge into, not the other way round.
    const order = [...keywords.keys()].sort((a, b) => (keywords[b].weight || 0) - (keywords[a].weight || 0));
    let changed = false;

    for (const i of order) {
      const kw = keywords[i];
      if (!kw || typeof kw !== 'object') continue;
      const candidate = getCanonicalGuess(kw);
      if (!candidate) continue;

      const candEmbedding = await embed(candidate);

      let best = null;
      let bestScore = -1;
      for (const entry of vocab) {
        const score = cosineSimilarity(candEmbedding, entry.embedding);
        if (score > bestScore) {
          bestScore = score;
          best = entry;
        }
      }

      if (best && bestScore >= THRESHOLD) {
        if (kw.canonical !== best.canonical) {
          if (verbose) console.log(`  MERGE  "${candidate}" -> "${best.canonical}"  (${bestScore.toFixed(3)})`);
          kw.canonical = best.canonical;
          changed = true;
          renamed++;
        } else {
          kept++;
        }
        synonyms.get(best.canonical).add(candidate);
      } else {
        // No good match — this candidate becomes a new anchor in the vocabulary.
        vocab.push({ canonical: candidate, embedding: candEmbedding });
        synonyms.set(candidate, new Set([candidate]));
        if (kw.canonical !== candidate) {
          kw.canonical = candidate;
          changed = true;
        }
        minted++;
      }
    }

    if (changed && !dryRun) {
      fs.writeFileSync(filePath, JSON.stringify(fac, null, 2), 'utf8');
    }
  }

  console.log(
    `Done. ${renamed} keywords merged into an existing canonical, ${kept} already correct, ` +
    `${minted} minted as new vocabulary entries, ${skippedLocked} faculty skipped (locked/verified).`
  );
  console.log(`Vocabulary size: ${existingTaxonomy ? Object.keys(existingTaxonomy).length : 0} -> ${vocab.length}`);

  if (dryRun) {
    console.log('Dry run — no files written.');
    return;
  }

  // Persist the updated taxonomy.
  const outTaxonomy = {};
  for (const [canonical, terms] of synonyms) {
    outTaxonomy[canonical] = [...terms].sort();
  }
  fs.writeFileSync(TAXONOMY_FILE, JSON.stringify(outTaxonomy, null, 2), 'utf8');

  // Regenerate index.json's top_keywords so the directory/graph reflect the new canonicals
  // immediately (mirrors run_scrape.py's logic, with the empty-canonical fallback fixed).
  const indexData = [];
  for (const filename of files) {
    const fac = JSON.parse(fs.readFileSync(path.join(FACULTY_DIR, filename), 'utf8'));
    const sorted = [...(fac.extracted_keywords || [])].sort((a, b) => (b.weight || 0) - (a.weight || 0));
    const topKeywords = sorted.slice(0, 3).map((k) => k.canonical || k.term || '').filter(Boolean);
    indexData.push({
      id: fac.id,
      name: fac.name,
      department: fac.department,
      school: fac.school || '',
      title: fac.title,
      top_keywords: topKeywords,
      photo_url: fac.photo_url,
      local_image_path: fac.local_image_path,
    });
  }
  indexData.sort((a, b) => (a.id || '').localeCompare(b.id || ''));
  fs.writeFileSync(INDEX_FILE, JSON.stringify(indexData, null, 2), 'utf8');
  console.log(`Regenerated index.json (${indexData.length} entries).`);
  console.log('Next: run build-embeddings then build-edges to reflect this in the graph/search.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
