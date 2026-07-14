import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

let extractorPromise = null;
function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractorPromise;
}

let cachedFaculty = null;
function loadFaculty() {
  if (cachedFaculty) return cachedFaculty;

  const embeddingsPath = path.join(process.cwd(), '../data/embeddings.json');
  const indexPath = path.join(process.cwd(), '../data/index.json');

  if (!fs.existsSync(embeddingsPath) || !fs.existsSync(indexPath)) {
    cachedFaculty = [];
    return cachedFaculty;
  }

  const embeddings = JSON.parse(fs.readFileSync(embeddingsPath, 'utf8'));
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  cachedFaculty = index
    .filter((person) => embeddings[person.id])
    .map((person) => ({ ...person, embedding: embeddings[person.id] }));

  return cachedFaculty;
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

export async function POST(request) {
  const body = await request.json().catch(() => null);
  const query = body?.query?.trim();

  if (!query) {
    return Response.json({ error: 'Please enter a research interest to search for.' }, { status: 400 });
  }

  const faculty = loadFaculty();
  if (faculty.length === 0) {
    return Response.json({ results: [] });
  }

  const extractor = await getExtractor();
  const output = await extractor(query, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(output.data);

  const ranked = faculty
    .map((person) => ({
      id: person.id,
      name: person.name,
      title: person.title,
      department: person.department,
      photo_url: person.photo_url,
      local_image_path: person.local_image_path,
      top_keywords: person.top_keywords || [],
      score: cosineSimilarity(queryEmbedding, person.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return Response.json({ results: ranked });
}
