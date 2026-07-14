'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

const POLL_MS = 2000;

export default function RegenerateCrossDomainButton() {
  const router = useRouter();
  const [status, setStatus] = useState(null); // { running, log, error, startedAt, finishedAt }
  const [showLog, setShowLog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [batchSize, setBatchSize] = useState(12);
  const [matchThreshold, setMatchThreshold] = useState(0.55);
  const pollRef = useRef(null);
  const logEndRef = useRef(null);

  const poll = useCallback(async () => {
    const res = await fetch('/api/collaborate/regenerate');
    const data = await res.json();
    setStatus(data);
    if (!data.running) {
      clearInterval(pollRef.current);
      pollRef.current = null;
      if (!data.error && data.finishedAt) {
        router.refresh();
      }
    }
  }, [router]);

  useEffect(() => {
    // Pick up an in-progress run on page load (e.g. started from another tab / the
    // desktop control panel), not just runs started from this button.
    poll();
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status?.running && !pollRef.current) {
      pollRef.current = setInterval(poll, POLL_MS);
    }
  }, [status?.running, poll]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [status?.log]);

  async function handleStart() {
    setShowLog(true);
    const res = await fetch('/api/collaborate/regenerate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchSize, matchThreshold }),
    });
    if (res.status === 409) {
      poll();
      return;
    }
    poll();
    pollRef.current = setInterval(poll, POLL_MS);
  }

  const running = status?.running;

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={handleStart}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-700 text-white text-sm font-semibold rounded-md hover:bg-amber-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={16} className={running ? 'animate-spin' : ''} />
          {running ? 'Generating… this can take several minutes' : 'Regenerate Cross-Disciplinary Map'}
        </button>

        <button
          onClick={() => setShowSettings((s) => !s)}
          className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
        >
          Settings {showSettings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {status?.log?.length > 0 && (
          <button
            onClick={() => setShowLog((s) => !s)}
            className="text-xs text-ulab-blue hover:underline"
          >
            {showLog ? 'Hide log' : 'Show log'}
          </button>
        )}

        {status?.error && <span className="text-xs text-red-600">Failed: {status.error}</span>}
        {!running && status?.finishedAt && !status?.error && (
          <span className="text-xs text-emerald-600">Done — graph updated.</span>
        )}
      </div>

      {showSettings && (
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600 border-t border-slate-100 pt-3">
          <label className="flex items-center gap-2">
            Batch size
            <input
              type="number"
              min={4}
              max={40}
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              className="w-16 border border-slate-300 rounded px-1.5 py-0.5 bg-white text-slate-900"
            />
          </label>
          <label className="flex items-center gap-2">
            Match threshold
            <input
              type="number"
              min={0.3}
              max={0.9}
              step={0.01}
              value={matchThreshold}
              onChange={(e) => setMatchThreshold(Number(e.target.value))}
              className="w-20 border border-slate-300 rounded px-1.5 py-0.5 bg-white text-slate-900"
            />
          </label>
          <p className="text-slate-400">
            Smaller batches / lower threshold = more pairs, slower and slightly noisier.
          </p>
        </div>
      )}

      {showLog && status?.log?.length > 0 && (
        <div className="mt-3 bg-slate-900 text-slate-100 rounded-md p-3 text-xs font-mono max-h-48 overflow-y-auto">
          {status.log.slice(-100).map((line, i) => (
            <div key={i}>{line}</div>
          ))}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}
