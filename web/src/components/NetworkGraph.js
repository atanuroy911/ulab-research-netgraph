'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import Link from 'next/link';
import { X, ExternalLink, Search } from 'lucide-react';

export default function NetworkGraph({ data }) {
  const fgRef = useRef();
  const containerRef = useRef();
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [hoverNode, setHoverNode] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [keywordFilter, setKeywordFilter] = useState('');
  const [nameQuery, setNameQuery] = useState('');

  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);
  const departments = useMemo(() => [...new Set(data.nodes.map((n) => n.department).filter(Boolean))].sort(), [data.nodes]);
  const keywords = useMemo(() => [...new Set(data.nodes.flatMap((n) => n.keywords || []).filter(Boolean))].sort(), [data.nodes]);

  const activeNodeIds = useMemo(() => {
    if (!departmentFilter && !keywordFilter) return null; // null = no filter, everything active
    const ids = new Set();
    data.nodes.forEach((n) => {
      const matchesDept = !departmentFilter || n.department === departmentFilter;
      const matchesKeyword = !keywordFilter || (n.keywords || []).includes(keywordFilter);
      if (matchesDept && matchesKeyword) ids.add(n.id);
    });
    return ids;
  }, [departmentFilter, keywordFilter, data.nodes]);

  const nameMatches = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return [];
    return data.nodes.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 8);
  }, [nameQuery, data.nodes]);

  useEffect(() => {
    // Size the graph to whatever vertical/horizontal space is actually left below its
    // top offset, instead of guessing a fixed navbar/header height (which drifted out of
    // sync with the real layout and pushed the graph — and its legend — below the fold).
    const updateDimensions = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const availableHeight = window.innerHeight - rect.top - 24; // 24px bottom breathing room
      setDimensions({
        width: rect.width,
        height: Math.max(availableHeight, 400),
      });
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

      data.links.forEach(link => {
        const s = link.source.id || link.source;
        const t = link.target.id || link.target;
        if (s === node.id) {
          neighbors.add(t);
          links.add(link);
        } else if (t === node.id) {
          neighbors.add(s);
          links.add(link);
        }
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

  const handleNodeClick = useCallback((node) => {
    selectNode(node);
  }, [selectNode]);

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
        if (other) rows.push({ node: other, weight: link.weight, shared_keywords: link.shared_keywords || [] });
      }
    });
    return rows.sort((a, b) => b.weight - a.weight);
  }, [selectedNode, data.links, nodeById]);

  // Canvas drawing for nodes
  const paintNode = useCallback((node, ctx, globalScale) => {
    const isHighlighted = highlightNodes.has(node.id);
    const isHovered = node === hoverNode;
    const isSelected = selectedNode && node.id === selectedNode.id;
    const isDimmed = activeNodeIds !== null && !activeNodeIds.has(node.id);

    // Draw circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, isSelected ? 7 : 5, 0, 2 * Math.PI, false);
    ctx.globalAlpha = isDimmed ? 0.12 : 1;
    ctx.fillStyle = isSelected ? '#D32027' : isHovered ? '#D32027' : isHighlighted ? '#F0B323' : '#002B5C';
    ctx.fill();
    if (isSelected) {
      ctx.lineWidth = 1.5 / globalScale;
      ctx.strokeStyle = '#000000';
      ctx.stroke();
    }

    // Node label
    if (!isDimmed && (isHighlighted || isSelected || globalScale > 2)) {
      const fontSize = 12 / globalScale;
      ctx.font = `${fontSize}px Sans-Serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#000000';
      ctx.fillText(node.name, node.x, node.y + 8);
    }
    ctx.globalAlpha = 1;
  }, [highlightNodes, hoverNode, activeNodeIds, selectedNode]);

  return (
    <div ref={containerRef} className="relative border border-slate-200 bg-white rounded-lg overflow-hidden shadow-sm">
      <ForceGraph2D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={data}
        nodeLabel="name"
        nodeColor={node => (highlightNodes.has(node.id) ? '#F0B323' : '#002B5C')}
        nodeRelSize={5}
        nodeCanvasObject={paintNode}
        linkColor={link => {
          if (activeNodeIds !== null) {
            const s = link.source.id || link.source;
            const t = link.target.id || link.target;
            if (!activeNodeIds.has(s) || !activeNodeIds.has(t)) return 'rgba(203, 213, 225, 0.08)';
          }
          return highlightLinks.has(link) ? '#D32027' : '#cbd5e1';
        }}
        linkWidth={link => (highlightLinks.has(link) ? 2 : 1)}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        cooldownTicks={100}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 50)}
      />

      {/* Search by name */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-full max-w-sm px-4">
        <div className="relative">
          <input
            type="text"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Search faculty by name..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-md shadow bg-white/95 focus:outline-none focus:ring-2 focus:ring-ulab-blue text-slate-900"
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

      {/* Filter panel */}
      <div className="absolute top-4 right-4 bg-white/95 p-4 rounded-md shadow text-sm border border-slate-200 max-w-xs">
        <h3 className="font-bold text-ulab-blue mb-2">Filters</h3>
        <div className="mb-3">
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
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Keyword</label>
          <select
            value={keywordFilter}
            onChange={(e) => setKeywordFilter(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded px-2 py-1.5 text-slate-900"
          >
            <option value="">All keywords</option>
            {keywords.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
        </div>
        {(departmentFilter || keywordFilter) && (
          <button
            onClick={() => { setDepartmentFilter(''); setKeywordFilter(''); }}
            className="mt-3 text-xs text-ulab-red hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 p-4 rounded-md shadow text-sm border border-slate-200 pointer-events-none max-w-xs">
        <h3 className="font-bold text-ulab-blue mb-2">Faculty Network</h3>
        <p className="text-slate-600 mb-2">
          Nodes represent faculty members. Edges represent shared research keywords.
        </p>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full bg-ulab-blue"></div>
          <span>Faculty Member</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full bg-[#cbd5e1]"></div>
          <span>Shared Interests</span>
        </div>
      </div>

      {/* Connections sidebar */}
      {selectedNode && (
        <div className="absolute top-0 right-0 h-full w-full sm:w-80 bg-white border-l border-slate-200 shadow-lg overflow-y-auto">
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
              Connections ({selectedConnections.length})
            </h4>
            <div className="space-y-3">
              {selectedConnections.map(({ node, weight, shared_keywords }) => (
                <div key={node.id} className="border border-slate-200 rounded-md p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-900 text-sm">{node.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">{Math.round(weight * 100)}%</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{node.department}</p>

                  {shared_keywords.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-[11px] text-slate-500 mb-1">Shared research interests:</p>
                      <div className="flex flex-wrap gap-1">
                        {shared_keywords.map((kw, i) => (
                          <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <p className="text-[11px] text-slate-500 mb-1">
                        No identical tags, but a {Math.round(weight * 100)}% overall research-profile similarity based on bios and keywords:
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">{selectedNode.name.split(' ')[0]}&apos;s focus</p>
                          {(selectedNode.keywords || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {selectedNode.keywords.slice(0, 3).map((kw, i) => (
                                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">{kw}</span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">No keywords extracted yet</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">{node.name.split(' ')[0]}&apos;s focus</p>
                          {(node.keywords || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {node.keywords.slice(0, 3).map((kw, i) => (
                                <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">{kw}</span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-400 italic">No keywords extracted yet</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex gap-3 mt-2">
                    <button
                      onClick={() => selectNode(node)}
                      className="text-xs text-ulab-blue hover:underline"
                    >
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
              {selectedConnections.length === 0 && (
                <p className="text-sm text-slate-400">No connections found.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
