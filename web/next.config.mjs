import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This app is a monorepo-style layout: /data lives one level above /web and is
// read at request time via fs.readFileSync(process.cwd() + '../data/...').
// Next's file tracer can't follow those dynamic paths on its own, so hosts that
// bundle routes as serverless functions (Netlify, Vercel) would ship without the
// data directory unless we force-include it here.
const dataGlobs = ['../data/*.json', '../data/faculty/**/*.json'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.join(__dirname, '..'),
  outputFileTracingIncludes: {
    '/': dataGlobs,
    '/directory': dataGlobs,
    '/network': dataGlobs,
    '/faculty/[id]': dataGlobs,
    '/api/match': dataGlobs,
  },
};

export default nextConfig;
