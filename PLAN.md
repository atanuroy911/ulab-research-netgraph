# ULAB Faculty Research Network — Project Plan

## 0. Goal

Build a site that maps ULAB faculty by research domain so students, faculty, and outsiders can
discover who works on what and find potential collaborators. Data is scraped from
`https://ulab.edu.bd/academics/faculty-list` and each faculty's individual profile page, enriched
with extracted research keywords, and visualized as a searchable network graph in a Next.js app
styled to match ulab.edu.bd.

No database. Git repo + static JSON is the source of truth. Deploys on Vercel, auto-redeploys on
every commit to main.

---

## 1. Repo structure

```
/scraper
  list_scraper.py
  profile_scraper.py
  run_scrape.py
  requirements.txt
  /cache/html/            # raw HTML cache, gitignored
/pipeline
  extract_keywords.py     # LLM pass -> extracted_keywords
  build_taxonomy.py       # canonicalize keyword variants
  build_edges.py          # similarity + shared-tag graph edges
/data
  /faculty/{slug}.json    # one file per person, source of truth
  index.json              # lightweight list for directory/graph views
  taxonomy.json           # canonical keyword vocabulary + synonyms
  edges.json              # precomputed graph edges
/web                      # Next.js app
  /app
  /components
  /lib
.github/workflows/
  rescrape.yml            # scheduled scraper run, opens PR
```

---

## 2. Data schema

`/data/faculty/{slug}.json`:

```json
{
  "id": "nafees-mansoor-phd",
  "name": "Nafees Mansoor, PhD",
  "title": "Associate Professor",
  "department": "Computer Science and Engineering (CSE)",
  "school": "School of Science and Engineering",
  "profile_url": "https://ulab.edu.bd/faculty/nafees-mansoor-phd",
  "photo_url": "",
  "bio_raw": "",
  "stated_interests": [],
  "education": [
    { "degree": "PhD", "field": "Electrical Engineering", "year": 2016, "institution": "UTM" }
  ],
  "publications_raw": [],
  "extracted_keywords": [
    { "term": "cognitive radio networks", "canonical": "Wireless Networks", "weight": 0.9, "source": "bio+pubs", "verified": false }
  ],
  "embedding": null,
  "scraped_at": "",
  "updated_at": "",
  "locked_fields": []
}
```

Rules:
- `bio_raw`, `department`, `title`, `education`, `publications_raw`, `profile_url` are
  scraper-owned — always overwritten on re-scrape.
- `extracted_keywords[].verified` — once a faculty member edits/approves their list via the edit
  flow, mark `verified: true` and add `"extracted_keywords"` to `locked_fields`. Re-scrapes must
  never overwrite locked fields; only a faculty member resetting it does.
- `embedding` is computed by the pipeline, not the scraper.

`/data/index.json`: array of `{id, name, department, school, title, top_keywords[3]}` for fast
directory/graph rendering without loading every faculty file.

`/data/taxonomy.json`: canonical keyword list with synonym mapping, e.g.
```json
{ "Wireless Networks": ["wireless communications", "ad-hoc networks", "vehicular ad-hoc networks"] }
```

`/data/edges.json`: `[{ "source": "id1", "target": "id2", "shared_keywords": ["..."], "weight": 0.0 }]`

---

## 3. Scraper (Python + Playwright)

**Stage A — `list_scraper.py`**
- Visit `https://ulab.edu.bd/academics/faculty-list`, paginate through all pages.
- For each card, extract `name`, `department`, `title`, `profile_url`.
- Write `/scraper/cache/faculty_links.json`.

**Stage B — `profile_scraper.py`**
- Visit each `profile_url`.
- Cache raw HTML to `/scraper/cache/html/{slug}.html` before parsing (so selector fixes don't
  require re-hitting the site).
- Extract: bio paragraph(s), stated research-interest sentence if present, education/degree list,
  full publication list block, photo URL.
- Write/update `/data/faculty/{slug}.json`, respecting `locked_fields` (never touch a locked
  field if the file already exists).

**Politeness / robustness**
- 1–2s delay between requests, headless Chromium, `wait_for_selector` on content block (no fixed
  sleeps).
- Retry with backoff on timeout; log failures to `/scraper/cache/failures.json` for manual review.
- Idempotent: safe to re-run; only writes when content actually changed (diff before write) to
  keep git history clean.

**`run_scrape.py`**: orchestrates Stage A then Stage B, regenerates `/data/index.json` at the end.

---

## 4. Keyword extraction & taxonomy pipeline

**`extract_keywords.py`**
- For each faculty file where `extracted_keywords` is empty or `locked_fields` doesn't include
  it: call Claude via the API with `bio_raw` + `stated_interests` + `publications_raw` titles,
  prompted to return structured JSON — a list of 10–20 research-domain phrases, each normalized
  to a short canonical form.
- Merge results into `extracted_keywords` with `verified: false`.

**`build_taxonomy.py`**
- Cluster near-duplicate terms across all faculty (string similarity + embedding similarity) into
  canonical entries in `/data/taxonomy.json`.
- Map every `extracted_keywords[].term` to a `canonical` value from the taxonomy.
- Re-run whenever new keywords are added; append-only (don't rename existing canonical terms
  without a migration pass, since edges.json depends on them).

**`build_edges.py`**
- Compute an embedding per faculty member (bio + canonical keywords, concatenated).
- Compute cosine similarity between all pairs; also compute shared-canonical-keyword count.
- Combined edge weight = normalized blend of the two.
- Keep top-k edges per node (e.g. k=8) plus any pair sharing ≥2 canonical keywords, to keep the
  graph readable rather than fully connected.
- Write `/data/edges.json`.

Run order: `extract_keywords.py` → `build_taxonomy.py` → `build_edges.py`.

---

## 5. Faculty edit flow

- Magic-link auth: faculty member enters their `@ulab.edu.bd` email on `/edit`, receives a
  sign-in link (any lightweight passwordless auth lib works here — no need for full user
  accounts).
- On their profile edit page: view auto-extracted keywords, add/remove/reorder, submit.
- Submission hits a Vercel serverless function that:
  1. Sets `verified: true` on `extracted_keywords`, adds to `locked_fields`.
  2. Uses the GitHub API to open a PR updating `/data/faculty/{slug}.json` (auto-merge is an
     option later; start with human review since this is a university-branded public page).
- On merge, Vercel redeploys automatically.

---

## 6. Frontend (Next.js, in `/web`)

**Style**: pull actual design tokens from ulab.edu.bd (font-family, primary/accent colors,
header/nav layout, card spacing) and encode as Tailwind theme / CSS variables so pages read as an
extension of the university site, not a bolted-on app.

**Pages**
- `/` — landing: search bar, featured/random connections, entry points for students vs faculty
  vs outside visitors.
- `/directory` — faculty list, filterable by school/department/keyword.
- `/faculty/[id]` — profile: bio, verified vs inferred keywords (visually distinguished),
  publications, "similar researchers" panel with shared-keyword explanation.
- `/network` — full interactive graph (Cytoscape.js or react-force-graph), filter by
  school/department/keyword, click a node to open that faculty's profile, click a keyword to
  highlight all faculty tagged with it.
- `/match` — student-facing: free-text box ("describe your interest") → embed query → ranked
  faculty matches with shared-keyword explanations.
- `/edit` — magic-link faculty self-edit flow.

**Data loading**: static JSON read at build/server time (`fs.readFileSync` in server
components); no client-side DB calls needed. `/match`'s free-text embedding call is the one
place needing a live API route (embed the query server-side, compare against precomputed faculty
embeddings loaded from `/data`).

---

## 7. Re-scrape automation

`.github/workflows/rescrape.yml`:
- Scheduled monthly (cron) + manual trigger.
- Runs `run_scrape.py`, then the pipeline scripts.
- Opens a PR with the diff for human review rather than pushing to main directly — catches
  scraper drift (site redesigns breaking selectors) before it goes live.
- On merge → Vercel auto-redeploys.

---

## 8. Build order (what to do first in Claude Code)

1. Scaffold repo structure above; write the JSON schema files (empty/example) so both scraper
   and frontend can target them from day one.
2. Build `list_scraper.py`, test against the live faculty-list page, output
   `faculty_links.json`.
3. Build `profile_scraper.py` against ~5 known faculty (e.g. Nafees Mansoor, whose profile
   structure is confirmed), validate extracted fields, then run full crawl.
4. Write `extract_keywords.py`, run once over the full dataset.
5. Write `build_taxonomy.py` and `build_edges.py`, generate `edges.json`.
6. Scaffold Next.js app with ULAB design tokens; build `/directory` and `/faculty/[id]` first
   (simplest, validates the data pipeline end-to-end).
7. Build `/network` graph view wired to `edges.json`.
8. Build `/match` student query flow.
9. Build `/edit` faculty self-edit flow + GitHub PR API route.
10. Add the GitHub Actions scheduled re-scrape workflow.
11. Deploy to Vercel, connect repo.

---

## 9. Open implementation notes for Claude Code to flag if uncertain

- Confirm actual CSS/selectors on the live faculty-list and profile pages before finalizing
  scraper selectors (page structure was sampled but should be re-verified in a live Playwright
  run, since markup can differ from cached search-snapshot text).
- Confirm whether department-level subdomains (e.g. `cse.ulab.edu.bd`) list the same faculty
  with different/extra bio content — decide merge-vs-primary-source rule before Stage B parsing.
- Decide embedding provider (OpenAI text-embedding, Voyage, or local sentence-transformers) —
  affects both `build_edges.py` and the `/match` API route; keep it swappable behind one function.
