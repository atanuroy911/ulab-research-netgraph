# ULAB Faculty Research Network — Enhancement Roadmap

> Everything below is **logically grounded** in the core goal: make it easy to discover who works on what, find collaborators, and grow the network's usefulness over time.

---

## Pillar 1 — Data Quality & Richness

The graph is only as good as the data it's built on. Right now we pull `bio`, `interests`, `education`, and `publications_raw` — but there's far more available.

### 1.1 Structured Publication Parsing
**Problem:** `publications_raw` is a raw text blob — unparseable.  
**Fix:** Parse each block into structured `{ title, venue, year, co_authors[], doi? }` objects. This unlocks:
- Actual **co-authorship edges** (if two ULAB faculty co-authored a paper, that's a hard link, not just a soft similarity).
- **Temporal analysis** — is their research trending toward ML or away from it?
- Venue prestige signals (IEEE, ACM, Nature journals).

### 1.2 Google Scholar / ORCID Enrichment Pass
**Problem:** ULAB's own site often has incomplete publication lists.  
**Fix:** After scraping the official profile, optionally do a secondary enrichment pass:
- Look up faculty name + "ULAB" on Google Scholar to get full citation counts, h-index, and a richer pub list.
- ORCID is public and free — many academics have records. Match by name + institution.
- Store as `scholar_id`, `orcid`, `h_index`, `citation_count` in the faculty JSON.

### 1.3 Scraped-At + Changed Detection
**Problem:** Re-scraping always overwrites; no history.  
**Fix:** Store `scraped_at` and `content_hash`. On re-scrape, only write if the hash changed. Write `changed_at` when it does. This gives a **changelog** per professor and avoids git noise.

### 1.4 Email Extraction
**Problem:** No contact info in the current schema.  
**Fix:** Extract the faculty email from the profile page (almost always present on university sites). Store as `email`. Power the magic-link edit flow and allow students to find the right contact.

### 1.5 Research Group / Lab Detection
**Problem:** Many faculty are part of named labs (e.g. "ML Lab", "IoT Research Group") but this isn't captured.  
**Fix:** Parse the profile bio for lab/group mentions using a simple regex + LLM pass. Add `research_groups: []` to the schema. Labs become a second type of **node** in the network (Faculty ↔ Lab edges).

---

## Pillar 2 — Graph Intelligence

The current graph draws a single flat layer of faculty-to-faculty similarity. A real network needs multiple semantic layers.

### 2.1 Multi-Layer Graph (Faculty + Keywords + Departments)

Currently the graph has **one node type** (faculty). Add:

| Node Type | What It Represents |
|---|---|
| `faculty` | Individual researcher (current) |
| `keyword` | Canonical research domain (from taxonomy) |
| `department` | Organizational unit |
| `lab` | Named research group (from 1.5) |

**Edges across types:**
- `faculty → keyword` (weight = keyword weight from LLM extraction)
- `faculty → department` (direct membership)
- `faculty → lab` (if detected)
- `keyword → keyword` (semantic similarity from embeddings, builds a **concept map**)

This makes the graph dramatically richer and more navigable.

### 2.2 Co-Authorship Edges (Hard Links)
If two faculty co-authored a paper, draw a **solid** co-authorship edge (vs. the current soft similarity edges which are dotted/light). These are facts, not estimates. Weight by number of shared papers.

### 2.3 Top-K Per Node, Not Global Threshold
**Problem:** The current edge threshold (`weight > 0.4 OR shared_keywords >= 2`) produces either too many or too few edges depending on cohort size.  
**Fix:** Keep the **top-K neighbors per node** (e.g. K=6) regardless of absolute weight. Every node stays connected; no faculty becomes an isolated island.

### 2.4 Community Detection (Research Clusters)
Run a graph clustering algorithm (Louvain, Leiden, or simple connected components) on the edges to identify **research clusters** automatically. Each cluster gets a label (derived from the dominant keywords within it). Color nodes by cluster on the graph. This is the most visually impactful enhancement possible.

### 2.5 Edge Explanation
Every edge in `edges.json` currently has `shared_keywords`. Surface these in the UI when hovering an edge — "These two researchers share: **Machine Learning**, **Computer Vision**." Users understand why two people are connected.

---

## Pillar 3 — Search & Discovery

### 3.1 Functional Semantic Search (`/match`)
The current `/match` page is a UI stub. Make it real:

```
User types: "I want to work on autonomous drones"
                ↓
         Embed the query (local: sentence-transformers, remote: OpenAI)
                ↓
         Cosine similarity vs. all precomputed faculty embeddings
                ↓
         Ranked list: Top 5 faculty with explanation of why
```

The faculty embeddings are **already being computed** in `build_edges.py`. Just expose them in a Next.js API route (`/api/match`) that loads the index + embeddings, embeds the query, and returns ranked results. No external database needed.

### 3.2 Keyword Drill-Down Page (`/domain/[keyword]`)
**Problem:** There's no way to ask "show me everyone who works on NLP."  
**Fix:** Add a `/domain/[canonical]` page that shows all faculty tagged with that keyword, their weights, and a mini subgraph of those faculty + their connections. This makes the taxonomy actionable.

### 3.3 Live Directory Search (Client-Side)
The directory search input is currently `disabled`. Enable it with a simple client-side filter over the pre-loaded index (100–300 faculty = trivially fast). Filter by name, department, keyword simultaneously using a scored rank.

### 3.4 Department / School Filter on Graph
Add a filter panel to `/network` — clicking "School of Science and Engineering" grays out all other nodes. Clicking a keyword highlights all nodes tagged with it. This makes the graph **navigable**, not just decorative.

---

## Pillar 4 — Faculty Profile UX

### 4.1 Timeline View of Research Evolution
If we have publication years (from 1.1), draw a small **research timeline** on each profile: what topics dominated in 2015–2018 vs. 2020–now. Answers: "Is this professor still active in X?"

### 4.2 Keyword Confidence Visual
Each keyword has a `weight` (0.1–1.0). Instead of showing all keywords identically, scale the badge size or opacity to the weight. A `weight: 0.9` keyword is their primary domain; `weight: 0.2` is peripheral.

### 4.3 Collaboration Graph on Profile
On `/faculty/[id]`, show a small local graph: this professor in the center, their top-5 neighbors around them, with edges labeled by shared keywords. Much more intuitive than just a list of "Similar Researchers."

### 4.4 "Potential Collaboration" vs "Active Collaboration"
Distinguish:
- 🔗 **Active:** Co-authored a paper (hard link from co-authorship edges)
- 🤝 **Potential:** High keyword overlap but no shared papers yet

Students and admins need to know this difference.

### 4.5 Research Gap Detection
For a given faculty member, look at their keywords vs. their department peers. Highlight keywords they have that **no one else in their department** shares — these are unique contributions. Also flag keywords that are common across the university except for their department — potential **collaboration opportunities**.

---

## Pillar 5 — Student-Facing Features

### 5.1 Thesis Supervisor Matching
Students fill in:
- Their research interest (free text → embedding)
- Their preferred department (optional)
- Their degree level (undergrad / masters / PhD)

System returns ranked supervisors. This is the most **directly useful** feature for students and the one most likely to drive traffic.

### 5.2 "Faculty Who Are Actively Taking Students" Flag
Add a `taking_students: true/false` flag to the schema. Faculty can set this via the edit flow. Students can filter by it. This alone makes the site significantly more useful than just the university directory.

### 5.3 Domain Explorer for Undecided Students
A guided flow: "I'm interested in..." → shows 3–5 relevant research domains with short explanations → shows 3 faculty per domain → links to profiles. Lowers the barrier for students who don't know what they're looking for.

---

## Pillar 6 — Faculty Self-Edit Flow (Complete It)

The plan describes a magic-link edit flow but it's not implemented. This is critical because **AI-extracted keywords are imperfect** — faculty need a way to correct them.

### 6.1 Magic-Link Auth
Faculty enters `@ulab.edu.bd` email → receives a one-time link (store tokens in a simple KV store like Vercel KV or a JSON file in a private repo). On click → authenticated session.

### 6.2 Keyword Editor
Drag-to-reorder, remove, add from taxonomy autocomplete, mark as verified. Submit → GitHub API creates a PR modifying their JSON file. Auto-merge after 24h if no admin review (configurable).

### 6.3 Profile Completion Score
Show faculty a "completeness" score on their edit page:
- Has bio? ✅
- Has photo? ✅
- Has verified keywords? ❌ (→ prompts action)
- Has publications? ✅

This gamifies data quality improvement.

### 6.4 "Flag as Incorrect" for Admins
Any authenticated admin can visit any profile and flag a keyword as incorrect, triggering a re-extraction or manual review. Flags stored in the JSON as `flagged_keywords: []`.

---

## Pillar 7 — Automation & Pipeline Robustness

### 7.1 Incremental Re-Scraping (Only Changed Pages)
**Problem:** Full re-scrapes are slow and hammer the university server.  
**Fix:** Store `scraped_at` per profile. On re-scrape, only re-fetch profiles where ULAB's server returns a `Last-Modified` header newer than `scraped_at`. Skip otherwise.

### 7.2 Scraper Health Dashboard (in Control Panel)
Add a tab to the control panel showing:
- How many profiles scraped vs. total known
- How many have keywords extracted
- How many have embeddings
- How many edges exist
- Last run timestamp
- Failures list (profiles that failed with their error)

### 7.3 Failure Recovery
Currently if `profile_scraper.py` fails on one profile, it logs the error and continues. But there's no retry mechanism.  
**Fix:** Write failed slugs to `scraper/cache/failures.json`. Add a `--retry-failures` flag to `run_scrape.py` that re-runs only those slugs.

### 7.4 GitHub Actions Scheduled Re-Scrape
The plan mentions this but it's not implemented. A monthly cron that:
1. Runs the full pipeline
2. Diffs the output vs. the current `main`
3. Opens a PR titled "Monthly data refresh — N profiles updated"
4. Auto-assigns an admin reviewer

This makes the site **self-maintaining**.

### 7.5 Diff-Only Writes (Reduce Git Noise)
Before writing any JSON file, compare the new content to the existing file. If nothing changed (ignoring `scraped_at`), skip the write. This keeps the git history clean — only meaningful changes appear in commits.

---

## Pillar 8 — Analytics & Admin Intelligence

### 8.1 Research Coverage Map
An admin view showing: for each department, what % of faculty have extracted keywords, verified keywords, publications, and embeddings. Identifies where data quality is weakest.

### 8.2 Collaboration Potential Report
A report (generated as JSON, viewable in the control panel) listing the top-20 faculty pairs by similarity who have **never co-authored a paper**. These are the most promising unexplored collaboration opportunities. Could be emailed to department heads.

### 8.3 Keyword Trend Analysis
Track taxonomy size over time (via git history). Which research domains are growing (new faculty being tagged with them)? Which are declining? Shows institutional research trends.

### 8.4 Page Analytics (Privacy-Respecting)
Add simple, self-hosted analytics (e.g. Umami or Plausible) to track:
- Which faculty profiles get the most views
- Which search queries are most common
- Which departments students explore most

No personal data; aggregate only.

---

## Pillar 9 — External Integrations

### 9.1 Google Scholar Public Profile Sync
For faculty who have public Scholar profiles, pull citation count, h-index, and top papers. Store in `scholar_metrics: { citations, h_index, i10_index }`. Display on profile.

### 9.2 ORCID Integration
ORCID is public and machine-readable. Look up by name + institution, pull structured works list, employment history, and funding. Richer than scraping the university site.

### 9.3 ResearchGate / Academia.edu Link Detection
During scraping, look for social research links in the profile page. Store as `research_profiles: { google_scholar: url, orcid: url, researchgate: url }`. Display as icon links on profile.

### 9.4 Open Access Paper Links
When we have DOIs (from 1.1), link to Unpaywall to check if a free version exists. Display a 🔓 badge next to papers that are open access. Students love free papers.

---

## Priority Order (What to Build First)

Based on **impact vs. effort**:

| Priority | Feature | Impact | Effort |
|---|---|---|---|
| 🔴 P0 | Functional `/match` semantic search | Very High | Low — embeddings already computed |
| 🔴 P0 | Live directory search (client-side filter) | High | Very Low |
| 🔴 P0 | Department/keyword filter on graph | High | Low |
| 🟡 P1 | `/domain/[keyword]` drill-down page | High | Low |
| 🟡 P1 | Co-authorship edges from structured pub parsing | High | Medium |
| 🟡 P1 | Community detection + cluster coloring | Very High | Medium |
| 🟡 P1 | Scraper health dashboard in control panel | Medium | Low |
| 🟢 P2 | Faculty edit flow (magic-link + GitHub PR) | High | High |
| 🟢 P2 | Thesis supervisor matching | Very High | Medium |
| 🟢 P2 | Google Scholar enrichment | High | Medium |
| 🔵 P3 | GitHub Actions auto-rescrape | Medium | Medium |
| 🔵 P3 | Research gap detection per faculty | Medium | High |
| 🔵 P3 | Multi-layer graph (keyword nodes) | High | High |

---

## The Single Biggest Unlock

> **Make the `/match` search actually work.**

Everything else is incremental. Semantic search transforms the site from a *directory* into a *discovery engine*. A student typing "I want to work on brain-computer interfaces" and getting back 3 relevant professors with explanations — that's the moment this project becomes genuinely useful to ULAB.

The infrastructure is already there: embeddings are computed and stored in each faculty JSON. One API route + one UI component is all that's needed.
