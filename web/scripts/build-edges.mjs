import fs from 'fs';
import path from 'path';
import { getSourceFilter, filterKeywords } from './keyword-source-filter.mjs';

const BASE_DIR = path.join(process.cwd(), '..');
const FACULTY_DIR = path.join(BASE_DIR, 'data', 'faculty');
const EDGES_FILE = path.join(BASE_DIR, 'data', 'edges.json');

function getCanonical(k) {
  if (k && typeof k === 'object') return k.canonical || k.term || k.keyword || String(k);
  return String(k);
}

// "machine learning" and "Machine Learning" are the same keyword — match case-insensitively,
// but keep one consistent casing (whichever side has it) for display in shared_keywords.
function normKey(s) {
  return String(s).trim().toLowerCase();
}

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

const TOP_K = 6;

function main() {
  const sourceFilter = getSourceFilter();
  if (sourceFilter) console.log(`Filtering keywords to sources: ${[...sourceFilter].join(', ')}`);

  const files = fs.readdirSync(FACULTY_DIR).filter((f) => f.endsWith('.json') && f !== 'example.json');
  const faculty = files.map((f) => JSON.parse(fs.readFileSync(path.join(FACULTY_DIR, f), 'utf8')));
  const n = faculty.length;

  // Full pairwise weight/shared-keyword matrix
  const pair = (i, j) => {
    const fac1 = faculty[i];
    const fac2 = faculty[j];
    const canon1 = filterKeywords(fac1.extracted_keywords, sourceFilter).map(getCanonical);
    const canon2 = filterKeywords(fac2.extracted_keywords, sourceFilter).map(getCanonical);
    const kws1 = new Map(canon1.map((k) => [normKey(k), k])); // normalized key -> display casing
    const kws2 = new Set(canon2.map(normKey));
    const shared = [...kws1.entries()].filter(([norm]) => kws2.has(norm)).map(([, display]) => display);
    const sim = cosineSimilarity(fac1.embedding || [], fac2.embedding || []);
    const weight = sim * 0.7 + Math.min(shared.length / 5, 1.0) * 0.3;
    return { shared, weight };
  };

  // Top-K neighbors per node, regardless of absolute weight, so no node is isolated.
  // Union across both directions: an edge survives if either endpoint picked the other as top-K.
  const edgeKey = (i, j) => (i < j ? `${i}-${j}` : `${j}-${i}`);
  const kept = new Map();

  for (let i = 0; i < n; i++) {
    const scored = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      scored.push({ j, ...pair(Math.min(i, j), Math.max(i, j)) });
    }
    scored.sort((a, b) => b.weight - a.weight);
    for (const { j, shared, weight } of scored.slice(0, TOP_K)) {
      const key = edgeKey(i, j);
      if (!kept.has(key) || kept.get(key).weight < weight) {
        kept.set(key, { source: faculty[Math.min(i, j)].id, target: faculty[Math.max(i, j)].id, shared_keywords: shared, weight });
      }
    }
  }

  const edges = [...kept.values()];
  fs.writeFileSync(EDGES_FILE, JSON.stringify(edges, null, 2), 'utf8');
  console.log(`Generated ${edges.length} edges among ${n} faculty members (top-${TOP_K} per node).`);
}

main();
