'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import Link from 'next/link';
import { X, ExternalLink, Search } from 'lucide-react';

export default function CrossDomainGraph({ data }) {
  const fgRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [hoverNode, setHoverNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [nameQuery, setNameQuery] = useState('');

  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);
  const departments = useMemo(() => [...new Set(data.nodes.map((n) => n.department).filter(Boolean))].sort(), [data.nodes]);

  // Only nodes that actually have a cross-disciplinary connection are interesting here —
  // faculty with zero cross edges are kept in the data (so counts stay honest) but dimmed.
  const connectedIds = useMemo(() => {
    const ids = new Set();
    data.links.forEach((l) => {
      ids.add(l.source.id || l.source);
      ids.add(l.target.id || l.target);
    });
    return ids;
  }, [data.links]);

  const activeNodeIds = useMemo(() => {
    if (!departmentFilter) return null;
    const ids = new Set();
    data.nodes.forEach((n) => {
      if (n.department === departmentFilter) ids.add(n.id);
    });
    return ids;
  }, [departmentFilter, data.nodes]);

  const nameMatches = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return [];
    return data.nodes.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 8);
  }, [nameQuery, data.nodes]);

  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const availableHeight = window.innerHeight - rect.top - 24;
      setDimensions({ width: rect.width, height: Math.max(availableHeight, 400) });
    };
    window.addEventListener('resize', updateDimensions);
    updateDimensions();
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const handleNodeHover = useCallback((node) => {
    setHighlightNodes(new Set());
    setHighlightLinks(new Set());
    if (node) {
      const neighbors = new Set([node.id]);
      const links = new Set();
      data.links.forEach((link) => {
        const s = link.source.id || link.source;
        const t = link.target.id || link.target;
        if (s === node.id) { neighbors.add(t); links.add(link); }
        else if (t === node.id) { neighbors.add(s); links.add(link); }
      });
      setHighlightNodes(neighbors);
      setHighlightLinks(links);
      setHoverNode(node);
    } else {
      setHoverNode(null);
    }
  }, [data]);

  const selectNode = useCallback((node) => {
    if (!node) return;
    setSelectedNode(node);
    if (fgRef.current) {
      fgRef.current.centerAt(node.x, node.y, 600);
      fgRef.current.zoom(3, 600);
    }
  }, []);

  const handleNodeClick = useCallback((node) => selectNode(node), [selectNode]);

  const selectedConnections = useMemo(() => {
    if (!selectedNode) return [];
    const rows = [];
    data.links.forEach((link) => {
      const s = link.source.id || link.source;
      const t = link.target.id || link.target;
      let otherId = null;
      if (s === selectedNode.id) otherId = t;
      else if (t === selectedNode.id) otherId = s;
      if (otherId) {
        const other = nodeById.get(otherId);
        if (other) rows.push({ node: other, matches: link.matches || [], weight: link.weight || 0 });
      }
    });
    return rows.sort((a, b) => b.matches.length - a.matches.length);
  }, [selectedNode, data.links, nodeById]);

  const paintNode = useCallback((node, ctx, globalScale) => {
    const isHighlighted = highlightNodes.has(node.id);
    const isHovered = node === hoverNode;
    const isSelected = selectedNode && node.id === selectedNode.id;
    const isDeptFiltered = activeNodeIds !== null && !activeNodeIds.has(node.id);
    const isUnconnected = !connectedIds.has(node.id);
    const isDimmed = isDeptFiltered || isUnconnected;

    ctx.beginPath();
    ctx.arc(node.x, node.y, isSelected ? 7 : 5, 0, 2 * Math.PI, false);
    ctx.globalAlpha = isDimmed ? 0.15 : 1;
    ctx.fillStyle = isSelected ? '#D32027' : isHovered ? '#D32027' : isHighlighted ? '#F0B323' : '#B45309';
    ctx.fill();
    if (isSelected) {
      ctx.lineWidth = 1.5 / globalScale;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    }

    if (!isDimmed && (isHighlighted || isSelected || globalScale > 2)) {
      const fontSize = 12 / globalScale;
      ctx.font = `${fontSize}px Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000000';
      ctx.fillText(node.name, node.x, node.y + 8);
    }
    ctx.globalAlpha = 1;
  }, [highlightNodes, hoverNode, activeNodeIds, selectedNode, connectedIds]);

  return (
    <div ref={containerRef} className="relative border border-slate-200 bg-white rounded-lg overflow-hidden shadow-sm">
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={data}
        nodeLabel="name"
        nodeRelSize={5}
        nodeCanvasObject={paintNode}
        linkColor={(link) => {
          if (activeNodeIds !== null) {
            const s = link.source.id || link.source;
            const t = link.target.id || link.target;
            if (!activeNodeIds.has(s) || !activeNodeIds.has(t)) return 'rgba(217, 119, 6, 0.06)';
          }
          return highlightLinks.has(link) ? '#D32027' : 'rgba(217, 119, 6, 0.45)';
        }}
        linkWidth={(link) => (highlightLinks.has(link) ? 2.5 : 1.5)}
        linkLineDash={[4, 3]}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        cooldownTicks={100}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 60)}
      />

      {/* Search by name */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-full max-w-sm px-4">
        <div className="relative">
          <input
            type="text"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Search faculty by name..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md shadow bg-white/95 focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900"
          />
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
        </div>
        {nameMatches.length > 0 && (
          <div className="mt-1 bg-white rounded-md shadow border border-slate-200 overflow-hidden">
            {nameMatches.map((n) => (
              <button
                key={n.id}
                onClick={() => { selectNode(n); setNameQuery(''); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 text-slate-900 border-b border-slate-100 last:border-b-0"
              >
                <div className="font-medium">{n.name}</div>
                <div className="text-xs text-slate-500">{n.department}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Department filter */}
      <div className="absolute top-4 right-4 bg-white/95 p-4 rounded-md shadow text-sm border border-slate-200 max-w-xs">
        <h3 className="font-bold text-amber-700 mb-2">Filter</h3>
        <label className="block text-xs font-medium text-slate-500 mb-1">Department</label>
        <select
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 text-slate-900"
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        {departmentFilter && (
          <button onClick={() => setDepartmentFilter('')} className="mt-3 text-xs text-ulab-red hover:underline">
            Clear filter
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 p-4 rounded-md shadow text-sm border border-slate-200 pointer-events-none max-w-xs">
        <h3 className="font-bold text-amber-700 mb-2">Cross-Disciplinary Map</h3>
        <p className="text-slate-600 mb-2">
          Dashed edges connect faculty in <strong>different</strong> departments whose expertise is a
          known productive method + domain pairing (e.g. Machine Learning + Linguistics), not just
          topical similarity.
        </p>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full bg-amber-700"></div>
          <span>Faculty with a cross-disciplinary match</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-700 opacity-20"></div>
          <span>No match yet (still shown for reference)</span>
        </div>
      </div>

      {/* Connections sidebar */}
      {selectedNode && (
        <div className="absolute top-0 right-0 h-full w-full sm:w-96 bg-white border-l border-slate-200 shadow-lg overflow-y-auto">
          <div className="flex items-start justify-between p-4 border-b border-slate-200">
            <div>
              <h3 className="font-bold text-slate-900">{selectedNode.name}</h3>
              <p className="text-sm text-slate-500">{selectedNode.department}</p>
              <Link
                href={`/faculty/${selectedNode.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-ulab-blue hover:underline mt-2"
              >
                View profile <ExternalLink size={14} />
              </Link>
            </div>
            <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-slate-600">
              <X size={20} />
            </button>
          </div>

          <div className="p-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-3">
              Cross-disciplinary matches ({selectedConnections.length})
            </h4>
            {selectedConnections.length === 0 && (
              <p className="text-sm text-slate-400">
                No cross-disciplinary matches found yet for this profile. This grows as more
                keyword pairings are added to the affinity table.
              </p>
            )}
            <div className="space-y-3">
              {selectedConnections.map(({ node, matches }) => (
                <div key={node.id} className="border border-slate-200 rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900 text-sm">{node.name}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{node.department}</p>

                  <div className="mt-2 space-y-2">
                    {matches.map((m, i) => (
                      <div key={i} className="bg-amber-50 border border-amber-200 rounded p-2">
                        <div className="flex flex-wrap gap-1 items-center text-[11px] font-medium">
                          <span className="px-1.5 py-0.5 rounded bg-white border border-amber-300 text-amber-800">{m.keyword_a}</span>
                          <span className="text-amber-600">&harr;</span>
                          <span className="px-1.5 py-0.5 rounded bg-white border border-amber-300 text-amber-800">{m.keyword_b}</span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{m.rationale}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-3 mt-2">
                    <button onClick={() => selectNode(node)} className="text-xs text-ulab-blue hover:underline">
                      View connections
                    </button>
                    <Link
                      href={`/faculty/${node.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-ulab-blue hover:underline inline-flex items-center gap-1"
                    >
                      Open profile <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
