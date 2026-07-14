import { spawn } from 'child_process';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// This admin action shells out to two local scripts (LLM calls against a self-hosted
// Ollama server + local embedding matching) that can run for many minutes. It only makes
// sense when this app is running locally/self-hosted where Ollama is reachable — it will
// not work on a serverless deploy (Netlify function timeouts, no access to a LAN Ollama
// instance). State is kept in module scope, which is fine for a single long-running
// server process but won't survive a restart or work across serverless instances.
const state = {
  running: false,
  log: [],
  startedAt: null,
  finishedAt: null,
  error: null,
};

function appendLog(line) {
  state.log.push(line);
  if (state.log.length > 500) state.log.shift();
}

function runScript(scriptPath, args, cwd) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath, ...args], { cwd });
    proc.stdout.on('data', (d) => d.toString().split('\n').forEach((l) => l.trim() && appendLog(l)));
    proc.stderr.on('data', (d) => d.toString().split('\n').forEach((l) => l.trim() && appendLog(`[stderr] ${l}`)));
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${path.basename(scriptPath)} exited with code ${code}`))));
    proc.on('error', reject);
  });
}

async function runPipeline(options) {
  const webDir = process.cwd();
  const args = [];
  if (options.batchSize) args.push('--batch-size', String(options.batchSize));
  if (options.matchThreshold) args.push('--match-threshold', String(options.matchThreshold));
  if (options.appsPerDomain) args.push('--apps-per-domain', String(options.appsPerDomain));
  if (options.distinctCeiling) args.push('--distinct-ceiling', String(options.distinctCeiling));

  try {
    appendLog('--- Generating domain affinity table (this is the slow step) ---');
    await runScript(path.join(webDir, 'scripts', 'build-domain-affinity.mjs'), args, webDir);

    appendLog('--- Rebuilding cross-disciplinary edges ---');
    await runScript(path.join(webDir, 'scripts', 'build-cross-domain-edges.mjs'), [], webDir);

    appendLog('--- Done ---');
  } catch (err) {
    state.error = err.message;
    appendLog(`[error] ${err.message}`);
  } finally {
    state.running = false;
    state.finishedAt = new Date().toISOString();
  }
}

export async function POST(request) {
  if (state.running) {
    return Response.json({ error: 'A regeneration is already in progress.' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));

  state.running = true;
  state.log = [];
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.error = null;

  // Fire and forget — client polls GET for progress.
  runPipeline(body);

  return Response.json({ started: true });
}

export async function GET() {
  return Response.json(state);
}
