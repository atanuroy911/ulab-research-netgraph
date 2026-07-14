export const metadata = {
  title: 'How This Works | ULAB Research Network',
  description: 'The data pipeline, models, and formulas behind the ULAB Faculty Research Network.',
};

function Formula({ children }) {
  return (
    <pre className="bg-slate-900 text-slate-100 rounded-md px-4 py-3 overflow-x-auto text-sm font-mono">
      {children}
    </pre>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 mb-14">
      <h2 className="text-2xl font-bold text-slate-900 mb-4 border-b border-slate-200 pb-2">{title}</h2>
      <div className="space-y-4 text-slate-700 leading-relaxed">{children}</div>
    </section>
  );
}

const steps = [
  {
    n: 1,
    title: 'Scrape',
    file: 'scraper/list_scraper.py, profile_scraper.py',
    body: 'Crawls the ULAB faculty directory and each individual profile page (bio, education, publications, photo). Writes one JSON file per faculty member to data/faculty/{slug}.json.',
  },
  {
    n: 2,
    title: 'Extract keywords',
    file: 'pipeline/extract_keywords.py',
    body: 'An LLM (via Ollama) reads each faculty member’s bio + publications and proposes 10–20 research-domain phrases, each with a term (the original wording), a first-pass canonical guess, and a weight (0.1–1.0) for prominence. This step is intentionally generative — it’s good at finding candidate phrases, less reliable at consistently labeling them.',
  },
  {
    n: 3,
    title: 'Canonicalize',
    file: 'web/scripts/canonicalize-keywords.mjs',
    body: 'The LLM’s free-form canonical labels get replaced with a deterministic nearest-neighbor match against a shared vocabulary (data/taxonomy.json), so "machine learning", "Machine Learning", and "ML" all converge on one label instead of three. See the Canonicalization formula below.',
  },
  {
    n: 4,
    title: 'Embed',
    file: 'web/scripts/build-embeddings.mjs',
    body: 'Each faculty member’s bio + canonical keywords are concatenated into one text blob and embedded into a 384-dimension vector using the all-MiniLM-L6-v2 sentence-transformer model, run locally via transformers.js. No external API calls.',
  },
  {
    n: 5,
    title: 'Build the graph',
    file: 'web/scripts/build-edges.mjs',
    body: 'Every pair of faculty gets a combined similarity score (see Edge weight below). To keep the graph readable and ensure nobody ends up an isolated island, each node keeps its top-6 highest-scoring neighbors rather than applying one global threshold.',
  },
  {
    n: 6,
    title: 'Serve',
    file: 'web/src/app/**/page.js',
    body: 'The Next.js app reads the resulting JSON files (index.json, edges.json, embeddings.json, data/faculty/*.json) directly off disk at request time — no database. The one exception is /match, which embeds your typed query on the fly and ranks it against the precomputed faculty embeddings.',
  },
];

export default function InfoPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-4xl font-bold text-slate-900 mb-3">How This Works</h1>
      <p className="text-lg text-slate-600 mb-10">
        This page explains the actual pipeline and formulas behind the directory, the network
        graph, and semantic search — not just what the site does, but how it computes it.
      </p>

      <nav className="mb-12 bg-slate-50 border border-slate-200 rounded-lg p-5">
        <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-2">On this page</p>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-ulab-blue text-sm">
          <li><a href="#pipeline" className="hover:underline">1. The data pipeline</a></li>
          <li><a href="#similarity" className="hover:underline">2. Cosine similarity</a></li>
          <li><a href="#canonicalization" className="hover:underline">3. Keyword canonicalization</a></li>
          <li><a href="#edges" className="hover:underline">4. Graph edge weight &amp; top-K</a></li>
          <li><a href="#match" className="hover:underline">5. Semantic search (/match)</a></li>
          <li><a href="#models" className="hover:underline">6. Models used</a></li>
        </ul>
      </nav>

      <Section id="pipeline" title="1. The data pipeline">
        <p>
          Faculty data flows through six stages, each reading the previous stage&rsquo;s output and
          writing back to <code className="bg-slate-100 px-1.5 py-0.5 rounded text-sm">/data</code>.
          Nothing is computed at request time except the two things that genuinely need to be
          (your search query, and rendering).
        </p>
        <ol className="space-y-4 mt-6">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-4">
              <div className="shrink-0 w-8 h-8 rounded-full bg-ulab-blue text-white flex items-center justify-center font-bold text-sm">
                {s.n}
              </div>
              <div>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h3 className="font-semibold text-slate-900">{s.title}</h3>
                  <code className="text-xs text-slate-400">{s.file}</code>
                </div>
                <p className="text-sm text-slate-600 mt-0.5">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="similarity" title="2. Cosine similarity">
        <p>
          Almost everything on this site — the graph edges, the search ranking, and keyword
          canonicalization — reduces to the same operation: turn text into a vector, then measure
          the angle between two vectors. Two vectors pointing in nearly the same direction (small
          angle) represent semantically similar text, regardless of their length.
        </p>
        <Formula>{`sim(a, b) = (a · b) / (‖a‖ × ‖b‖)`}</Formula>
        <p className="text-sm text-slate-500">
          Where <code className="bg-slate-100 px-1 rounded">a · b</code> is the dot product and{' '}
          <code className="bg-slate-100 px-1 rounded">‖a‖</code> is the Euclidean norm (length) of
          vector a. The result ranges from -1 (opposite) to 1 (identical direction); in practice,
          for sentence embeddings, unrelated text typically scores 0.1–0.4 and closely related
          text scores 0.6+.
        </p>
      </Section>

      <Section id="canonicalization" title="3. Keyword canonicalization">
        <p>
          The LLM extraction step produces free-form labels, so the same concept often comes out
          differently for different faculty (&ldquo;machine learning&rdquo; vs. &ldquo;Machine
          Learning&rdquo; vs. &ldquo;ML&rdquo;) — which would make the graph looks sparse even
          when people genuinely work in the same area. Instead of asking the LLM to guess a
          consistent label (which it did unreliably), canonicalization is a deterministic
          nearest-neighbor lookup:
        </p>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Embed the candidate keyword.</li>
          <li>Compare it against every canonical label already in the vocabulary via cosine similarity.</li>
          <li>
            If the best match scores <code className="bg-slate-100 px-1 rounded">&ge; 0.72</code>,
            merge into that existing canonical label.
          </li>
          <li>Otherwise, mint it as a new vocabulary entry.</li>
        </ol>
        <Formula>{`canonical(k) = argmax_v∈V sim(embed(k), embed(v))   if max ≥ 0.72
             = k                                    otherwise (new entry, added to V)`}</Formula>
        <p className="text-sm text-slate-500">
          0.72 was chosen empirically against this dataset: it merges case variants, plural forms,
          and abbreviation expansions ("AI" → "Artificial Intelligence") without conflating
          genuinely distinct-but-related fields — Machine Learning and Computer Vision stay
          separate. Below roughly 0.70, merges start getting questionable (e.g. "Financial
          Management" merging into "financial technology").
        </p>
      </Section>

      <Section id="edges" title="4. Graph edge weight & top-K neighbors">
        <p>
          Whether two faculty members are connected in the network graph, and how strongly, comes
          from a blend of two signals: how similar their overall research profile is (embedding
          similarity across bio + keywords), and how many canonical keywords they share outright.
        </p>
        <Formula>{`weight(i, j) = 0.7 × sim(embed(i), embed(j))
             + 0.3 × min(|shared_keywords(i, j)| / 5, 1.0)`}</Formula>
        <p>
          A global weight threshold produces either a nearly-fully-connected graph (cohort with
          broadly similar bios) or a sparse one with isolated nodes (small, diverse cohort) —
          the right threshold depends on the dataset and doesn&rsquo;t stay right as it grows.
          Instead, every node keeps its top-6 highest-weight edges regardless of the absolute
          score, so the graph stays readable and no faculty member is ever fully disconnected.
        </p>
      </Section>

      <Section id="match" title="5. Semantic search (/match)">
        <p>
          Typing a research interest into <em>Find Match</em> embeds your query text with the same
          model used for faculty profiles, then ranks every faculty member by cosine similarity
          between your query vector and their precomputed profile vector — no keyword matching
          involved, so a query like &ldquo;brain-computer interfaces&rdquo; can surface someone
          whose bio never uses that exact phrase but is semantically close to it.
        </p>
        <Formula>{`rank(query) = sort_desc { sim(embed(query), embed(faculty_i)) : i ∈ faculty }`}</Formula>
      </Section>

      <Section id="models" title="6. Models used">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
            <thead className="bg-slate-100 text-slate-700">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Task</th>
                <th className="text-left px-4 py-2 font-semibold">Model</th>
                <th className="text-left px-4 py-2 font-semibold">Where it runs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="px-4 py-2">Keyword extraction</td>
                <td className="px-4 py-2 font-mono text-xs">llama3:8b (Ollama)</td>
                <td className="px-4 py-2">Self-hosted Ollama server, pipeline-time only</td>
              </tr>
              <tr>
                <td className="px-4 py-2">Text embeddings</td>
                <td className="px-4 py-2 font-mono text-xs">Xenova/all-MiniLM-L6-v2</td>
                <td className="px-4 py-2">Locally, via transformers.js (no external API)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-slate-500">
          The embedding model produces 384-dimension vectors and is used identically at
          pipeline-build time (for every faculty profile) and at request time (for your search
          query), so the two are always directly comparable.
        </p>
      </Section>
    </div>
  );
}
