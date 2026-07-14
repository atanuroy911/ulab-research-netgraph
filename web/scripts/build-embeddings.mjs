import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';
import { getSourceFilter, filterKeywords } from './keyword-source-filter.mjs';

const BASE_DIR = path.join(process.cwd(), '..');
const FACULTY_DIR = path.join(BASE_DIR, 'data', 'faculty');
const EMBEDDINGS_FILE = path.join(BASE_DIR, 'data', 'embeddings.json');

function getCanonical(k) {
  if (k && typeof k === 'object') return k.canonical || k.term || k.keyword || String(k);
  return String(k);
}

async function main() {
  const sourceFilter = getSourceFilter();
  if (sourceFilter) console.log(`Filtering keywords to sources: ${[...sourceFilter].join(', ')}`);

  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const files = fs.readdirSync(FACULTY_DIR).filter((f) => f.endsWith('.json') && f !== 'example.json');

  const embeddings = {};
  for (const filename of files) {
    const filePath = path.join(FACULTY_DIR, filename);
    const fac = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    const bio = fac.bio_raw || '';
    const canonical = filterKeywords(fac.extracted_keywords, sourceFilter).map(getCanonical);
    const text = `${bio} ${canonical.join(' ')}`.trim();

    let vec;
    if (!text) {
      vec = new Array(384).fill(0);
    } else {
      const out = await extractor(text, { pooling: 'mean', normalize: true });
      vec = Array.from(out.data);
    }

    fac.embedding = vec;
    fs.writeFileSync(filePath, JSON.stringify(fac, null, 2), 'utf8');
    embeddings[fac.id] = vec;
    console.log(`Embedded ${fac.id}`);
  }

  fs.writeFileSync(EMBEDDINGS_FILE, JSON.stringify(embeddings), 'utf8');
  console.log(`Wrote ${Object.keys(embeddings).length} embeddings to ${EMBEDDINGS_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
