'use client';

import { Suspense, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { User, Loader2 } from 'lucide-react';

function MatchForm() {
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get('q') || '';
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const autoSearched = useRef(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setError('');
    setResults(null);

    try {
      const res = await fetch('/api/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong.');
      } else {
        setResults(data.results);
      }
    } catch (err) {
      setError('Could not reach the search service.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQuery && !autoSearched.current) {
      autoSearched.current = true;
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Find Match</h1>
      <p className="text-slate-600 mb-8">
        Enter your research query below, and we will find ULAB faculty with matching expertise.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-2xl mx-auto">
        <textarea
          rows={4}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSearch();
          }}
          className="w-full p-4 border border-slate-300 rounded-md focus:ring-2 focus:ring-ulab-blue focus:border-ulab-blue outline-none resize-none text-slate-900"
          placeholder="E.g., I am looking for someone to collaborate on deep learning for natural language processing..."
        ></textarea>

        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="mt-4 w-full bg-ulab-blue text-white font-semibold py-3 rounded-md hover:bg-ulab-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading && <Loader2 className="animate-spin" size={18} />}
          {loading ? 'Searching...' : 'Search Researchers'}
        </button>

        {error && <div className="mt-4 text-sm text-center text-red-600">{error}</div>}
      </div>

      {results && (
        <div className="max-w-3xl mx-auto mt-10">
          {results.length === 0 ? (
            <div className="text-center py-10 text-slate-500">No faculty data available yet.</div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-900">Top matches</h2>
              {results.map((person) => {
                let imgSrc = null;
                if (person.local_image_path) {
                  const filename = person.local_image_path.split(/[\\/]/).pop();
                  imgSrc = `/images/${filename}`;
                } else if (person.photo_url) {
                  imgSrc = person.photo_url;
                }

                return (
                  <Link
                    href={`/faculty/${person.id}`}
                    key={person.id}
                    className="flex items-center gap-4 bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                      {imgSrc ? (
                        <img src={imgSrc} alt={person.name} className="w-full h-full object-cover" />
                      ) : (
                        <User size={24} className="text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-semibold text-slate-900 truncate">{person.name}</h3>
                        <span className="text-xs font-medium text-ulab-blue shrink-0">
                          {Math.round(person.score * 100)}% match
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 truncate">{person.department}</p>
                      {person.top_keywords?.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {person.top_keywords.map((kw, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800"
                            >
                              {kw}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MatchPage() {
  return (
    <Suspense fallback={null}>
      <MatchForm />
    </Suspense>
  );
}
