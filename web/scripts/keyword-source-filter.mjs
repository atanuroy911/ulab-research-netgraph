// Shared source-filter logic for build-embeddings.mjs / build-edges.mjs.
// Lets the control panel restrict which extracted_keywords[].source values
// (e.g. "bio", "pubs", "bio+pubs") feed into the embedding text / edge weights,
// so you can compare "graph built from bios only" vs "graph built from publications only" etc.

export function getSourceFilter() {
  const raw = process.env.KEYWORD_SOURCE_FILTER || '';
  const tokens = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return tokens.length > 0 ? new Set(tokens) : null; // null = no filtering, include everything
}

export function keywordPassesFilter(keyword, filterSet) {
  if (!filterSet) return true;
  const source = keyword && typeof keyword === 'object' ? keyword.source : null;
  if (!source) return true; // fail open: legacy/unlabeled keywords are never silently dropped
  const parts = String(source).toLowerCase().split('+').map((s) => s.trim());
  return parts.some((p) => filterSet.has(p));
}

export function filterKeywords(keywords, filterSet) {
  if (!filterSet) return keywords || [];
  return (keywords || []).filter((k) => keywordPassesFilter(k, filterSet));
}
