import React, { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  NodeProps,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { api } from '../api';
import { CanvasDataResponse, ExchangeEntry, Model } from '../types';
import { StatusBadge, TierBadge } from '../components/StatusBadge';
import {
  User,
  Bot,
  GitBranch,
  Cpu,
  Layers,
  FileText,
  Wrench,
  X,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Check
} from 'lucide-react';

// ==========================================
// Custom Nodes
// ==========================================

const YouNode = ({ data }: NodeProps) => (
  <div className="px-4 py-3 rounded-xl bg-zinc-900 border-2 border-emerald-500/60 shadow-lg text-center min-w-[120px]">
    <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-1">
      <User className="w-4 h-4" />
    </div>
    <div className="text-xs font-bold text-zinc-100">{data.label as string}</div>
    <div className="text-[10px] text-zinc-400 font-mono">User / Owner</div>
    <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
  </div>
);

const OrchestratorNode = ({ data }: NodeProps) => {
  const isWorking = data.status === 'working';
  return (
    <div className="p-4 rounded-xl bg-zinc-900 border-2 border-emerald-500/70 shadow-xl min-w-[220px] space-y-3">
      <Handle type="target" position={Position.Left} className="!bg-emerald-400 !w-2.5 !h-2.5" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <Bot className="w-4 h-4" />
          </div>
          <span className="text-xs font-bold text-zinc-100">Orchestrator</span>
        </div>
        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
          isWorking ? 'bg-amber-950 text-amber-400 animate-pulse' : 'bg-emerald-950 text-emerald-400'
        }`}>
          {isWorking ? 'working' : 'idle'}
        </span>
      </div>

      {/* Slots: Model, Plan, Tools (Stage 5B requirement) */}
      <div className="space-y-1.5 pt-1 border-t border-zinc-800 text-xs">
        {/* Model slot */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            (data as any).onSlotClick?.('orchestrator', 'planning');
          }}
          className="flex items-center justify-between p-1.5 rounded bg-zinc-950 hover:bg-zinc-800/80 cursor-pointer border border-zinc-800/80 transition-colors"
        >
          <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
            <Cpu className="w-3 h-3 text-emerald-400" />
            Model:
          </span>
          {(data as any).model ? (
            <span className="font-mono text-[10px] text-emerald-300 font-medium truncate max-w-[110px]">
              {(data as any).model.name}
            </span>
          ) : (
            <span className="text-[10px] text-red-400 font-mono">No model</span>
          )}
        </div>

        {/* Plan slot (read-only link) */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            (data as any).onNavigateToPlan?.();
          }}
          className="flex items-center justify-between p-1.5 rounded bg-zinc-950 hover:bg-zinc-800/80 cursor-pointer border border-zinc-800/80 transition-colors"
        >
          <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
            <FileText className="w-3 h-3 text-blue-400" />
            Plan:
          </span>
          <span className="text-[10px] text-blue-400 font-mono hover:underline">View Plan →</span>
        </div>

        {/* Tools slot (placeholder until stage 7A) */}
        <div className="flex items-center justify-between p-1.5 rounded bg-zinc-950/50 border border-zinc-800/40 text-zinc-600">
          <span className="text-[10px] font-mono flex items-center gap-1">
            <Wrench className="w-3 h-3" />
            Tools:
          </span>
          <span className="text-[10px] font-mono">(Reviewer - Stage 7)</span>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-emerald-400 !w-2.5 !h-2.5" />
    </div>
  );
};

const BranchNode = ({ data }: NodeProps) => {
  const d = data as any;
  const isBlocked = d.status === 'blocked';
  const isWorking = d.status === 'working';
  return (
    <div className={`p-4 rounded-xl bg-zinc-900 border-2 shadow-xl min-w-[240px] space-y-3 ${
      isBlocked ? 'border-red-500/70' : isWorking ? 'border-amber-500/70' : 'border-zinc-700'
    }`}>
      <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-2.5 !h-2.5" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
            <GitBranch className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-zinc-100 block">{d.name}</span>
            <span className="text-[10px] font-mono text-zinc-400">role: {d.role}</span>
          </div>
        </div>
        <StatusBadge status={d.status} />
      </div>

      {/* Progress */}
      <div className="text-[11px] font-mono text-zinc-400 flex items-center justify-between pt-1 border-t border-zinc-800">
        <span>Progress:</span>
        <span className="text-zinc-200">{d.doneSteps}/{d.totalSteps} steps</span>
      </div>

      {/* Slots: Model, Plan, Tools */}
      <div className="space-y-1.5 text-xs">
        <div
          onClick={(e) => {
            e.stopPropagation();
            d.onSlotClick?.(d.slug, d.role);
          }}
          className="flex items-center justify-between p-1.5 rounded bg-zinc-950 hover:bg-zinc-800/80 cursor-pointer border border-zinc-800/80 transition-colors"
        >
          <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
            <Cpu className="w-3 h-3 text-emerald-400" />
            Model:
          </span>
          {d.assignedModel ? (
            <span className="font-mono text-[10px] text-emerald-300 font-medium truncate max-w-[120px]">
              {d.assignedModel.name}
            </span>
          ) : (
            <span className="text-[10px] text-red-400 font-mono">No model</span>
          )}
        </div>

        <div
          onClick={(e) => {
            e.stopPropagation();
            d.onNavigateToPlan?.();
          }}
          className="flex items-center justify-between p-1.5 rounded bg-zinc-950 hover:bg-zinc-800/80 cursor-pointer border border-zinc-800/80 transition-colors"
        >
          <span className="text-[10px] text-zinc-400 font-mono flex items-center gap-1">
            <FileText className="w-3 h-3 text-blue-400" />
            Plan:
          </span>
          <span className="text-[10px] text-blue-400 font-mono hover:underline">View Plan →</span>
        </div>

        <div className="flex items-center justify-between p-1.5 rounded bg-zinc-950/50 border border-zinc-800/40 text-zinc-600">
          <span className="text-[10px] font-mono flex items-center gap-1">
            <Wrench className="w-3 h-3" />
            Tools:
          </span>
          <span className="text-[10px] font-mono">(Reviewer - Stage 7)</span>
        </div>
      </div>

      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-2.5 !h-2.5" />
    </div>
  );
};

const ModelNode = ({ data }: NodeProps) => {
  const d = data as any;
  return (
    <div className="p-3.5 rounded-xl bg-zinc-900 border border-zinc-800 shadow-md min-w-[200px] space-y-2">
      <Handle type="target" position={Position.Left} className="!bg-purple-400 !w-2.5 !h-2.5" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-purple-400 shrink-0" />
          <span className="text-xs font-bold text-zinc-200 font-mono truncate max-w-[120px]">{d.modelName}</span>
        </div>
        <TierBadge tier={d.tier} />
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1 border-t border-zinc-800">
        <span>{d.provider}</span>
        <span className="capitalize">{d.kind}</span>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-zinc-500">P{d.priority}</span>
        <StatusBadge status={d.status} />
      </div>
    </div>
  );
};

const nodeTypes = {
  youNode: YouNode,
  orchestratorNode: OrchestratorNode,
  branchNode: BranchNode,
  modelNode: ModelNode
};

// ==========================================
// Canvas Page Component
// ==========================================

interface CanvasPageProps {
  onNavigateToPlan: () => void;
}

export const CanvasPage: React.FC<CanvasPageProps> = ({ onNavigateToPlan }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [allModels, setAllModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);

  // Detail Drawer state
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [exchanges, setExchanges] = useState<ExchangeEntry[]>([]);
  const [expandedExchangeId, setExpandedExchangeId] = useState<string | null>(null);

  // Slot Assignment Bottom Sheet
  const [slotPicker, setSlotPicker] = useState<{ targetType: string; targetSlug?: string; role: string } | null>(null);
  const [assigningModelId, setAssigningModelId] = useState<string>('');

  const loadCanvasData = useCallback(async () => {
    try {
      const data: CanvasDataResponse = await api.getCanvasData();
      setAllModels(data.allModels);

      // Attach handlers to node data
      const enrichedNodes = data.nodes.map((n: any) => ({
        ...n,
        data: {
          ...n.data,
          onNavigateToPlan,
          onSlotClick: (targetSlug: string, role: string) => {
            setSlotPicker({
              targetType: n.type === 'orchestratorNode' ? 'orchestrator' : 'branch',
              targetSlug,
              role
            });
            if (data.allModels.length > 0) {
              setAssigningModelId(data.allModels[0].id);
            }
          }
        }
      }));

      setNodes((prevNodes: any[]) => {
        // Keep current coordinates if user dragged
        return enrichedNodes.map((newNode: any) => {
          const match = prevNodes.find((p) => p.id === newNode.id);
          if (match && match.position) {
            return { ...newNode, position: match.position };
          }
          return newNode;
        });
      });

      setEdges(data.edges);
    } catch (err) {
      console.error('Failed to load canvas data:', err);
    }
  }, [onNavigateToPlan, setNodes, setEdges]);

  useEffect(() => {
    loadCanvasData();
    const interval = setInterval(loadCanvasData, 3000); // 3s live polling per 7.9
    return () => clearInterval(interval);
  }, [loadCanvasData]);

  const onNodeDragStop = useCallback(
    async (_event: any, node: any) => {
      const positions = { [node.id]: node.position };
      await api.saveCanvasPositions(positions);
    },
    []
  );

  const onNodeClick = useCallback(async (_event: any, node: any) => {
    setSelectedEntity({ type: 'node', data: node.data, id: node.id, nodeType: node.type });
    try {
      const ex = await (await fetch('/api/exchanges')).json();
      setExchanges(ex);
    } catch {}
  }, []);

  const onEdgeClick = useCallback(async (_event: any, edge: any) => {
    setSelectedEntity({ type: 'edge', data: edge });
    try {
      const ex = await (await fetch('/api/exchanges')).json();
      setExchanges(ex);
    } catch {}
  }, []);

  const handleConfirmAssignment = async () => {
    if (!slotPicker || !assigningModelId) return;
    try {
      await api.assignCanvasSlot({
        targetType: slotPicker.targetType,
        targetSlug: slotPicker.targetSlug,
        modelId: assigningModelId,
        role: slotPicker.role
      });
      setSlotPicker(null);
      await loadCanvasData();
    } catch (err: any) {
      alert('Failed to assign model: ' + err.message);
    }
  };

  return (
    <div className="relative w-full h-[calc(100vh-3.5rem)] bg-zinc-950 overflow-hidden">
      {/* Live Canvas header bar */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-3 bg-zinc-900/90 backdrop-blur border border-zinc-800 px-3.5 py-2 rounded-lg shadow-lg text-xs font-mono">
        <span className="flex items-center gap-1.5 text-zinc-200 font-semibold font-sans">
          <Layers className="w-4 h-4 text-emerald-400" />
          Live Architecture Canvas (Stage 5)
        </span>
        <span className="text-zinc-500">•</span>
        <span className="text-[11px] text-zinc-400">Columns: You → Orchestrator → Branches → Models</span>
      </div>

      {/* React Flow Graph */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        fitView
        className="bg-zinc-950"
      >
        <Background color="#27272a" gap={20} size={1} />
        <Controls className="!bg-zinc-900 !border-zinc-800 !text-zinc-200" />
      </ReactFlow>

      {/* Side Drawer: Entity Details & Exchange Inspector (Rule 7.9) */}
      {selectedEntity && (
        <div className="absolute top-0 right-0 z-30 w-full sm:w-96 h-full bg-zinc-900 border-l border-zinc-800 p-5 overflow-y-auto space-y-4 shadow-2xl">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              Node Details & Audit Inspector
            </h3>
            <button
              onClick={() => setSelectedEntity(null)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-zinc-950 p-3 rounded-lg border border-zinc-800 font-mono text-xs space-y-1.5">
            <div className="text-zinc-400">ID: <span className="text-zinc-200">{selectedEntity.id}</span></div>
            <div className="text-zinc-400">Type: <span className="text-emerald-400">{selectedEntity.nodeType || selectedEntity.type}</span></div>
            {selectedEntity.data?.role && (
              <div className="text-zinc-400">Role: <span className="text-zinc-200">{selectedEntity.data.role}</span></div>
            )}
            {selectedEntity.data?.status && (
              <div className="text-zinc-400">Status: <span className="text-zinc-200">{selectedEntity.data.status}</span></div>
            )}
          </div>

          {/* Exchanges Log list (last 20) */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-zinc-300 font-mono uppercase">
              Recent Model Exchanges ({exchanges.length})
            </h4>

            {exchanges.length === 0 ? (
              <p className="text-xs text-zinc-500 italic">No exchanges logged yet.</p>
            ) : (
              <div className="space-y-2 max-h-[480px] overflow-y-auto">
                {exchanges.slice(0, 20).map((ex) => {
                  const isExpanded = expandedExchangeId === ex.id;
                  return (
                    <div
                      key={ex.id}
                      className="p-2.5 rounded bg-zinc-950 border border-zinc-800 text-xs space-y-1.5"
                    >
                      <div
                        onClick={() => setExpandedExchangeId(isExpanded ? null : ex.id)}
                        className="flex items-center justify-between cursor-pointer hover:text-emerald-400 transition-colors"
                      >
                        <div className="flex items-center gap-1.5 font-mono text-[11px] text-zinc-300">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          <span className="font-semibold text-emerald-400">{ex.caller}</span>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-500">{ex.durationMs}ms</span>
                      </div>

                      {isExpanded && (
                        <div className="space-y-2 pt-1 border-t border-zinc-800/80 font-mono text-[11px]">
                          <div>
                            <span className="text-zinc-500 block text-[10px] uppercase">Prompt:</span>
                            <pre className="p-2 bg-zinc-900 rounded text-zinc-300 whitespace-pre-wrap max-h-32 overflow-y-auto">
                              {ex.prompt}
                            </pre>
                          </div>
                          <div>
                            <span className="text-zinc-500 block text-[10px] uppercase">Response:</span>
                            <pre className="p-2 bg-zinc-900 rounded text-zinc-300 whitespace-pre-wrap max-h-32 overflow-y-auto">
                              {ex.response}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Model Slot Assignment Bottom Sheet (Stage 5B requirement) */}
      {slotPicker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-emerald-400" />
                Assign Model Slot (Priority 1)
              </h3>
              <button onClick={() => setSlotPicker(null)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Assigning a model to <strong>{slotPicker.targetSlug || slotPicker.targetType}</strong> (role: <strong>{slotPicker.role}</strong>) will make it the primary model (Priority 1) and shift others down as fallbacks.
            </p>

            <div>
              <label className="block text-xs font-semibold text-zinc-300 mb-1.5">Select Model:</label>
              <select
                value={assigningModelId}
                onChange={(e) => setAssigningModelId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-emerald-500"
              >
                {allModels.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.modelName} ({m.tier}) — P{m.priority}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setSlotPicker(null)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAssignment}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
