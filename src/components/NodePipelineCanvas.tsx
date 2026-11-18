import React, { useRef, useState } from 'react';
import { CheckCircle2, Cpu, Play, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { PipelineEdge, PipelineNode } from '../types/studio';

interface NodePipelineCanvasProps {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
  onMoveNode: (id: string, x: number, y: number) => void;
  onAddNode: (category: PipelineNode['category']) => void;
  onRunPipeline: () => void;
  onResetLayout: () => void;
  isPipelineRunning: boolean;
}

const NODE_WIDTH = 236;

export const NodePipelineCanvas: React.FC<NodePipelineCanvasProps> = ({
  nodes,
  edges,
  selectedNodeId,
  onSelectNode,
  onMoveNode,
  onAddNode,
  onRunPipeline,
  onResetLayout,
  isPipelineRunning,
}) => {
  const [showAddMenu, setShowAddMenu] = useState(false);
  const dragState = useRef<{
    nodeId: string | null;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    nodeId: null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const handleNodePointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    node: PipelineNode
  ) => {
    e.stopPropagation();
    onSelectNode(node.id);
    dragState.current = {
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleNodePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.nodeId) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    onMoveNode(
      dragState.current.nodeId,
      Math.max(16, dragState.current.origX + dx),
      Math.max(72, dragState.current.origY + dy)
    );
  };

  const handleNodePointerUp = () => {
    dragState.current.nodeId = null;
  };

  const getPortCoordinates = (node: PipelineNode, portId: string, direction: 'in' | 'out') => {
    const list = direction === 'in' ? node.inputs : node.outputs;
    const index = Math.max(
      0,
      list.findIndex((p) => p.id === portId)
    );
    const x = direction === 'in' ? node.x : node.x + NODE_WIDTH;
    const y = node.y + 56 + index * 26;
    return { x, y };
  };

  return (
    <section className="relative flex-1 min-h-[560px] studio-grid-bg overflow-auto select-none">
      {/* Top Floating Pipeline Action Bar */}
      <div className="sticky top-4 left-4 right-4 z-30 px-4 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        <div className="glass-layer-2 rounded-lg p-1.5 flex items-center gap-2 pointer-events-auto relative">
          <button
            type="button"
            onClick={() => setShowAddMenu((prev) => !prev)}
            className="btn-kinetic inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-[#e4e1e9] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Node</span>
          </button>

          <button
            type="button"
            onClick={onResetLayout}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-[#cbc3d7] hover:text-[#e4e1e9] hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Graph</span>
          </button>

          {showAddMenu && (
            <div className="glass-layer-3 absolute top-full left-0 mt-2 w-48 rounded-lg p-1.5 space-y-1 z-40">
              {(
                [
                  { cat: 'generator', label: 'Latent Generator' },
                  { cat: 'modifier', label: 'Subdivision Modifier' },
                  { cat: 'shader', label: 'PBR Shader Node' },
                ] as const
              ).map((item) => (
                <button
                  key={item.cat}
                  type="button"
                  onClick={() => {
                    onAddNode(item.cat);
                    setShowAddMenu(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-md text-xs text-[#e4e1e9] hover:bg-[#8b5cf6]/20 transition-colors cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="glass-layer-2 rounded-lg p-1.5 flex items-center gap-3 pointer-events-auto">
          <div className="px-2 text-xs text-[#cbc3d7] flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-[#4cd7f6]" />
            <span>{isPipelineRunning ? 'Compiling Pipeline' : 'Pipeline Ready'}</span>
          </div>
          <button
            type="button"
            onClick={onRunPipeline}
            disabled={isPipelineRunning}
            className="btn-synthetic inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium text-white whitespace-nowrap cursor-pointer disabled:opacity-60"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{isPipelineRunning ? 'Running...' : 'Run Pipeline'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Graph Surface */}
      <div className="relative min-w-[940px] min-h-[540px] w-full h-full">
        {/* SVG Thread Connections */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <defs>
            <linearGradient id="edge-stream" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#06b6d4" />
            </linearGradient>
            <linearGradient id="edge-transform" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#d0bcff" />
              <stop offset="100%" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>

          {edges.map((edge) => {
            const fromNode = nodes.find((n) => n.id === edge.fromNodeId);
            const toNode = nodes.find((n) => n.id === edge.toNodeId);
            if (!fromNode || !toNode) return null;

            const start = getPortCoordinates(fromNode, edge.fromPortId, 'out');
            const end = getPortCoordinates(toNode, edge.toPortId, 'in');
            const dx = Math.max(60, Math.abs(end.x - start.x) * 0.55);
            const pathData = `M ${start.x} ${start.y} C ${start.x + dx} ${start.y}, ${
              end.x - dx
            } ${end.y}, ${end.x} ${end.y}`;

            const active = fromNode.enabled && toNode.enabled;
            return (
              <path
                key={edge.id}
                d={pathData}
                fill="none"
                stroke={
                  edge.type === 'stream' ? 'url(#edge-stream)' : 'url(#edge-transform)'
                }
                strokeWidth={active ? 2.2 : 1.4}
                strokeOpacity={active ? 0.9 : 0.3}
                strokeDasharray={isPipelineRunning && active ? '6 4' : undefined}
              />
            );
          })}
        </svg>

        {/* Draggable Node Cards */}
        {nodes.map((node) => {
          const isSelected = node.id === selectedNodeId;
          return (
            <div
              key={node.id}
              onPointerDown={(e) => handleNodePointerDown(e, node)}
              onPointerMove={handleNodePointerMove}
              onPointerUp={handleNodePointerUp}
              onPointerCancel={handleNodePointerUp}
              style={{
                left: node.x,
                top: node.y,
                width: NODE_WIDTH,
              }}
              className={`glass-layer-2 spectral-top-edge absolute rounded-2xl cursor-grab active:cursor-grabbing transition-shadow ${
                isSelected ? 'node-glow-active' : 'hover:border-white/[0.18]'
              } ${!node.enabled ? 'opacity-55' : ''}`}
            >
              {/* Node Header */}
              <div className="px-3.5 py-2.5 border-b border-white/[0.06] flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-display text-xs font-semibold text-[#e4e1e9] truncate">
                    {node.title}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {node.status === 'running' ? (
                    <span className="text-[10px] font-mono text-[#4cd7f6]">Running</span>
                  ) : node.status === 'compiled' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#4cd7f6]" />
                  ) : (
                    <SlidersHorizontal className="w-3.5 h-3.5 text-[#958ea0]" />
                  )}
                </div>
              </div>

              {/* Ports Row */}
              <div className="py-2 space-y-1.5">
                {Array.from({
                  length: Math.max(node.inputs.length, node.outputs.length),
                }).map((_, idx) => {
                  const inPort = node.inputs[idx];
                  const outPort = node.outputs[idx];
                  return (
                    <div
                      key={idx}
                      className="relative flex items-center justify-between px-3.5 h-5 text-[11px]"
                    >
                      {inPort ? (
                        <div className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className={`absolute -left-1.5 w-3 h-3 rounded-full border-2 border-[#0a0a0f] ${
                              inPort.type === 'stream'
                                ? 'bg-[#06b6d4] shadow-[0_0_8px_#06b6d4]'
                                : 'bg-[#8b5cf6] shadow-[0_0_8px_#8b5cf6]'
                            }`}
                          />
                          <span className="text-[#cbc3d7]">{inPort.label}</span>
                        </div>
                      ) : (
                        <span />
                      )}

                      {outPort ? (
                        <div className="flex items-center gap-2 ml-auto">
                          <span className="text-[#cbc3d7]">{outPort.label}</span>
                          <span
                            aria-hidden="true"
                            className={`absolute -right-1.5 w-3 h-3 rounded-full border-2 border-[#0a0a0f] ${
                              outPort.type === 'stream'
                                ? 'bg-[#06b6d4] shadow-[0_0_8px_#06b6d4]'
                                : 'bg-[#8b5cf6] shadow-[0_0_8px_#8b5cf6]'
                            }`}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {/* Compact Parameter Readout */}
              <div className="px-3.5 py-2 border-t border-white/[0.06] bg-[#0a0a0f]/35 rounded-b-2xl space-y-1">
                {node.params.map((p) => (
                  <div key={p.key} className="flex items-center justify-between text-[11px]">
                    <span className="text-[#958ea0]">{p.label}</span>
                    <span className="font-mono tabular-nums text-[#e4e1e9]">
                      {p.value}
                      {p.unit ?? ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
