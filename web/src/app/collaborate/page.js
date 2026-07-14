import fs from 'fs';
import path from 'path';
import CrossDomainGraph from '@/components/CrossDomainGraphLoader';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Cross-Disciplinary Map | ULAB',
};

async function getGraphData() {
  try {
    const indexFile = path.join(process.cwd(), '../data/index.json');
    const crossEdgesFile = path.join(process.cwd(), '../data/cross_edges.json');

    if (!fs.existsSync(indexFile)) {
      return { nodes: [], links: [] };
    }

    const facultyList = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    const crossEdges = fs.existsSync(crossEdgesFile) ? JSON.parse(fs.readFileSync(crossEdgesFile, 'utf8')) : [];

    const nodes = facultyList.map((fac) => ({
      id: fac.id,
      name: fac.name,
      department: fac.department,
      val: 1,
    }));

    const validNodeIds = new Set(nodes.map((n) => n.id));
    const validEdges = crossEdges.filter((e) => validNodeIds.has(e.source) && validNodeIds.has(e.target));

    return { nodes, links: validEdges };
  } catch (error) {
    console.error('Error generating cross-domain graph data:', error);
    return { nodes: [], links: [] };
  }
}

export default async function CollaboratePage() {
  const graphData = await getGraphData();

  return (
    <div className="max-w-[100vw] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-slate-900">Cross-Disciplinary Collaboration Map</h1>
        <p className="text-slate-600 mt-1">
          Faculty in different departments whose expertise pairs well together — e.g. AI/ML with
          Linguistics, or IoT with flood control — not just people who work on similar things.
          See <a href="/info#cross-domain" className="text-ulab-blue hover:underline">how this is computed</a>.
        </p>
      </div>

      {graphData.nodes.length > 0 ? (
        <CrossDomainGraph data={graphData} />
      ) : (
        <div className="w-full h-[600px] flex items-center justify-center bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-slate-500">No data available yet.</p>
        </div>
      )}
    </div>
  );
}
