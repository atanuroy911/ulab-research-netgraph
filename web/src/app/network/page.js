import fs from 'fs';
import path from 'path';
import NetworkGraph from '@/components/NetworkGraphLoader';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Faculty Network Graph | ULAB',
};

async function getGraphData() {
  try {
    const indexFile = path.join(process.cwd(), '../data/index.json');
    const edgesFile = path.join(process.cwd(), '../data/edges.json');
    
    if (!fs.existsSync(indexFile) || !fs.existsSync(edgesFile)) {
      return { nodes: [], links: [] };
    }
    
    const facultyList = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    const edges = JSON.parse(fs.readFileSync(edgesFile, 'utf8'));
    
    const nodes = facultyList.map(fac => ({
      id: fac.id,
      name: fac.name,
      department: fac.department,
      keywords: fac.top_keywords || [],
      val: 1
    }));
    
    // Only include links where both source and target exist in nodes
    const validNodeIds = new Set(nodes.map(n => n.id));
    const validEdges = edges.filter(e => validNodeIds.has(e.source) && validNodeIds.has(e.target));
    
    return {
      nodes,
      links: validEdges
    };
  } catch (error) {
    console.error("Error generating graph data:", error);
    return { nodes: [], links: [] };
  }
}

export default async function NetworkPage() {
  const graphData = await getGraphData();

  return (
    <div className="max-w-[100vw] mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-slate-900">Research Network</h1>
        <p className="text-slate-600 mt-1">
          Visualizing research collaboration potential across ULAB.
        </p>
      </div>
      
      {graphData.nodes.length > 0 ? (
        <NetworkGraph data={graphData} />
      ) : (
        <div className="w-full h-[600px] flex items-center justify-center bg-slate-50 border border-slate-200 rounded-lg">
          <p className="text-slate-500">No network data available yet.</p>
        </div>
      )}
    </div>
  );
}
