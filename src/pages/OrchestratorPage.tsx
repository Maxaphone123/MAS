import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { ChatMessage, Model, BranchState, DirectiveDiff } from '../types';
import {
  Bot,
  Send,
  Trash2,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Play,
  Square,
  Sliders,
  Check,
  X,
  FileEdit,
  ArrowRight
} from 'lucide-react';

interface OrchestratorPageProps {
  onPlanCreated: () => void;
  onNavigateToModels: () => void;
}

export const OrchestratorPage: React.FC<OrchestratorPageProps> = ({ onPlanCreated, onNavigateToModels }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planningModel, setPlanningModel] = useState<Model | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [planGenError, setPlanGenError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Stage 3B: Mode toggle (Discussion vs Execution)
  const [mode, setMode] = useState<'discussion' | 'execution'>('discussion');
  const [branches, setBranches] = useState<BranchState[]>([]);
  const [isRunnerActive, setIsRunnerActive] = useState(false);

  // Directive modal / form state
  const [showDirectiveModal, setShowDirectiveModal] = useState(false);
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [directiveInstruction, setDirectiveInstruction] = useState('');
  const [previewingDirective, setPreviewingDirective] = useState(false);
  const [directiveDiff, setDirectiveDiff] = useState<DirectiveDiff | null>(null);
  const [directiveNewMarkdown, setDirectiveNewMarkdown] = useState<string | null>(null);
  const [confirmingDirective, setConfirmingDirective] = useState(false);
  const [directiveNotice, setDirectiveNotice] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const reg = await api.getRegistry();
      const planning = reg.models
        .filter(m => m.roles.includes('planning'))
        .sort((a, b) => a.priority - b.priority)[0] || null;
      setPlanningModel(planning);

      const chatHistory = await api.getOrchestratorChat();
      setMessages(chatHistory);

      const branchList = await api.getBranches();
      setBranches(branchList);
      if (branchList.length > 0 && selectedBranches.length === 0) {
        setSelectedBranches([branchList[0].slug]);
      }

      const runnerStatus = await api.getRunnerStatus();
      setIsRunnerActive(runnerStatus.isRunning);
    } catch (err: any) {
      console.error('Failed to load orchestrator data:', err);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      try {
        const b = await api.getBranches();
        setBranches(b);
        const r = await api.getRunnerStatus();
        setIsRunnerActive(r.isRunning);
      } catch {}
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');
    setErrorBanner(null);

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setLoading(true);

    try {
      const res = await api.sendOrchestratorMessage(userText);
      if (res.ok && res.message) {
        setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), tempUserMsg, res.message!]);
      } else {
        setErrorBanner(res.error || 'Failed to get response from Orchestrator model.');
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Network error while contacting Orchestrator.');
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = async () => {
    if (!confirm('Start a new conversation? Current chat history will be cleared.')) return;
    await api.clearOrchestratorChat();
    setMessages([]);
    setErrorBanner(null);
  };

  const handleCreatePlan = async () => {
    if (messages.length === 0) {
      alert('Please discuss your project requirements in the chat first.');
      return;
    }
    setGeneratingPlan(true);
    setPlanGenError(null);
    try {
      const res = await api.generatePlan();
      if (res.ok) {
        onPlanCreated();
      } else {
        setPlanGenError(res.error || 'Failed to generate plan.');
      }
    } catch (err: any) {
      setPlanGenError(err.message || 'Error occurred during plan synthesis.');
    } finally {
      setGeneratingPlan(false);
    }
  };

  const handleRunAllBranches = async () => {
    try {
      setIsRunnerActive(true);
      await api.runAllBranches();
      const b = await api.getBranches();
      setBranches(b);
    } catch (err: any) {
      setErrorBanner(err.message || 'Execution error.');
    } finally {
      setIsRunnerActive(false);
    }
  };

  const handleStop = async () => {
    await api.stopRunners();
    setIsRunnerActive(false);
  };

  const toggleBranchSelection = (slug: string) => {
    if (selectedBranches.includes(slug)) {
      if (selectedBranches.length > 1) {
        setSelectedBranches(selectedBranches.filter(s => s !== slug));
      }
    } else {
      setSelectedBranches([...selectedBranches, slug]);
    }
  };

  const handlePreviewDirective = async () => {
    if (!directiveInstruction.trim() || selectedBranches.length === 0) {
      alert('Please select at least one branch and enter an instruction.');
      return;
    }
    setPreviewingDirective(true);
    setErrorBanner(null);
    try {
      const res = await api.previewDirective(selectedBranches, directiveInstruction.trim());
      if (res.ok && res.diff && res.newMarkdown) {
        setDirectiveDiff(res.diff);
        setDirectiveNewMarkdown(res.newMarkdown);
      } else {
        setErrorBanner(res.error || 'Directive preview failed.');
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Error previewing directive.');
    } finally {
      setPreviewingDirective(false);
    }
  };

  const handleConfirmDirective = async () => {
    if (!directiveNewMarkdown) return;
    setConfirmingDirective(true);
    try {
      const res = await api.confirmDirective(directiveNewMarkdown, directiveInstruction.trim());
      if (res.ok) {
        setDirectiveNotice(`Directive applied! Created new plan version v${res.version}.`);
        setShowDirectiveModal(false);
        setDirectiveDiff(null);
        setDirectiveNewMarkdown(null);
        setDirectiveInstruction('');
        const updated = await api.getBranches();
        setBranches(updated);
      } else {
        setErrorBanner(res.error || 'Failed to confirm directive.');
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Error confirming directive.');
    } finally {
      setConfirmingDirective(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 h-[calc(100vh-3.5rem)] flex flex-col space-y-4">
      {/* Top bar with mode toggle and controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900/80 border border-zinc-800 rounded-lg p-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-zinc-100">Orchestrator</h2>
              {planningModel ? (
                <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/40">
                  {planningModel.modelName} ({planningModel.tier})
                </span>
              ) : (
                <span className="text-[11px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/40">
                  No planning model
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400">
              {mode === 'discussion'
                ? 'Discussion mode: Free-form planning dialog. Talk with model to agree on architecture.'
                : 'Execution mode: Branch status monitoring, batch execution, and targeted directives.'}
            </p>
          </div>
        </div>

        {/* Mode controls & Actions (Stage 3B requirement) */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Mode toggle */}
          <div className="flex rounded-md bg-zinc-950 border border-zinc-800 p-0.5 text-xs font-medium">
            <button
              onClick={() => setMode('discussion')}
              className={`px-2.5 py-1 rounded transition-colors ${
                mode === 'discussion'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Discussion
            </button>
            <button
              onClick={() => setMode('execution')}
              className={`px-2.5 py-1 rounded transition-colors ${
                mode === 'execution'
                  ? 'bg-emerald-600/30 text-emerald-300 font-semibold border border-emerald-500/30'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Execution
            </button>
          </div>

          {mode === 'discussion' ? (
            <>
              <button
                onClick={handleClearChat}
                disabled={messages.length === 0}
                className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors"
                title="New conversation"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              <button
                onClick={handleCreatePlan}
                disabled={generatingPlan || messages.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-medium shadow-sm transition-all"
              >
                <Sparkles className={`w-3.5 h-3.5 ${generatingPlan ? 'animate-spin' : ''}`} />
                {generatingPlan ? 'Generating Plan...' : 'Create plan from discussion'}
              </button>
            </>
          ) : (
            /* Execution mode action buttons */
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDirectiveModal(true)}
                disabled={branches.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded text-xs font-medium border border-zinc-700 transition-all"
              >
                <Sliders className="w-3.5 h-3.5 text-emerald-400" />
                Directive to Branches
              </button>

              {isRunnerActive ? (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold shadow-sm transition-all"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleRunAllBranches}
                  disabled={branches.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-medium shadow-sm transition-all"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Start All Branches
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Branch Status Summary bar in Execution mode */}
      {mode === 'execution' && branches.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-zinc-900/60 p-3 rounded-lg border border-zinc-800 text-xs">
          {branches.map(b => {
            const done = b.steps.filter(s => s.status === 'done').length;
            const blocked = b.steps.some(s => s.status === 'blocked');
            return (
              <div key={b.slug} className="bg-zinc-950/70 p-2 rounded border border-zinc-800/80">
                <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                  <span className="font-semibold text-zinc-200 truncate">{b.name}</span>
                  <span className={blocked ? 'text-red-400' : done === b.steps.length ? 'text-emerald-400' : 'text-amber-400'}>
                    {done}/{b.steps.length}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono mt-0.5 truncate">
                  {blocked ? 'Blocked' : done === b.steps.length ? 'Complete' : `Step ${b.currentStep}`}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Directives notice */}
      {directiveNotice && (
        <div className="flex items-center justify-between p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{directiveNotice}</span>
          </div>
          <button onClick={() => setDirectiveNotice(null)} className="text-zinc-400 hover:text-zinc-200">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Warnings & Errors */}
      {!planningModel && (
        <div className="flex items-center justify-between p-3 bg-amber-950/30 border border-amber-900/60 rounded text-xs text-amber-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>No model configured with the <strong>planning</strong> role.</span>
          </div>
          <button
            onClick={onNavigateToModels}
            className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[11px] font-medium"
          >
            Assign in Models
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/60 rounded text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {planGenError && (
        <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/60 rounded text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{planGenError}</span>
        </div>
      )}

      {/* Chat Messages area */}
      <div className="flex-1 overflow-y-auto bg-zinc-900/40 border border-zinc-800/80 rounded-lg p-4 space-y-4 font-sans">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Start Project Discussion</h3>
              <p className="text-xs text-zinc-400 max-w-md mt-1">
                Describe the web application, feature, or tool you want to build. The Orchestrator will clarify questions and prepare an agreed breakdown into isolated branches.
              </p>
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-zinc-500 font-mono">
                <span>{m.role === 'user' ? 'You' : 'Orchestrator'}</span>
                <span>•</span>
                <span>{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-emerald-600/20 text-emerald-100 border border-emerald-500/30'
                    : 'bg-zinc-900 text-zinc-200 border border-zinc-800 shadow-sm'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-900/60 p-3 rounded border border-zinc-800 w-fit">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            <span>Orchestrator is thinking...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSendMessage} className="relative">
        <textarea
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          placeholder={
            mode === 'execution'
              ? 'Ask Orchestrator about branch progress, blocker reasons, or next actions...'
              : 'Discuss the plan, requirements, or architecture with Orchestrator (Enter to send)...'
          }
          disabled={loading || !planningModel}
          className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500 disabled:opacity-50 pr-24 resize-none shadow-sm"
        />
        <div className="absolute right-2.5 bottom-3.5 flex items-center gap-1.5">
          <button
            type="submit"
            disabled={loading || !input.trim() || !planningModel}
            className="p-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-md transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Directive Modal (Stage 3B requirement) */}
      {showDirectiveModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-xl w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <FileEdit className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-zinc-100">Send Directive to Selected Branches</h3>
              </div>
              <button
                onClick={() => {
                  setShowDirectiveModal(false);
                  setDirectiveDiff(null);
                  setDirectiveNewMarkdown(null);
                }}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: Branch Checkboxes (Rule 6.5 Isolation: only target branches modified) */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">
                1. Select Target Branches to Update:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {branches.map(b => (
                  <button
                    type="button"
                    key={b.slug}
                    onClick={() => toggleBranchSelection(b.slug)}
                    className={`flex items-center gap-2 p-2.5 rounded border text-xs text-left transition-all ${
                      selectedBranches.includes(b.slug)
                        ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[10px] font-bold ${
                      selectedBranches.includes(b.slug) ? 'bg-emerald-500 text-black' : 'border border-zinc-700'
                    }`}>
                      {selectedBranches.includes(b.slug) ? '✓' : ''}
                    </span>
                    <span className="font-medium truncate">{b.name}</span>
                    <span className="text-[10px] text-zinc-500 font-mono">({b.role})</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-zinc-500">
                Rule 6.5: All unselected branches will remain strictly untouched and byte-identical.
              </p>
            </div>

            {/* Step 2: Directive Instruction */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-300">
                2. Instruction for Selected Branches:
              </label>
              <textarea
                rows={3}
                value={directiveInstruction}
                onChange={(e) => setDirectiveInstruction(e.target.value)}
                placeholder="e.g.: Add validation for input data and handle network timeouts..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Step 3: Diff Preview Display */}
            {directiveDiff && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3 text-xs">
                <h4 className="font-semibold text-emerald-400 flex items-center gap-1.5 text-xs">
                  <ArrowRight className="w-4 h-4" />
                  Directive Preview Diff
                </h4>
                <div className="space-y-1.5 font-mono text-[11px]">
                  {directiveDiff.addedSteps.length > 0 && (
                    <div className="text-emerald-400">
                      + Added {directiveDiff.addedSteps.length} steps: {directiveDiff.addedSteps.map(s => s.title).join(', ')}
                    </div>
                  )}
                  {directiveDiff.modifiedSteps.length > 0 && (
                    <div className="text-blue-400">
                      ~ Modified {directiveDiff.modifiedSteps.length} steps: {directiveDiff.modifiedSteps.map(s => s.title).join(', ')}
                    </div>
                  )}
                  {directiveDiff.removedSteps.length > 0 && (
                    <div className="text-red-400">
                      - Removed {directiveDiff.removedSteps.length} steps: {directiveDiff.removedSteps.map(s => s.title).join(', ')}
                    </div>
                  )}
                  {directiveDiff.doneStepsToResetCount > 0 && (
                    <div className="text-amber-400 font-bold">
                      ⚠ {directiveDiff.doneStepsToResetCount} completed step(s) will be reset to todo.
                    </div>
                  )}
                  {directiveDiff.addedSteps.length === 0 &&
                   directiveDiff.modifiedSteps.length === 0 &&
                   directiveDiff.removedSteps.length === 0 && (
                    <div className="text-zinc-400">No step changes detected.</div>
                  )}
                </div>
              </div>
            )}

            {/* Modal actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  setShowDirectiveModal(false);
                  setDirectiveDiff(null);
                  setDirectiveNewMarkdown(null);
                }}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs"
              >
                Cancel
              </button>

              {!directiveDiff ? (
                <button
                  onClick={handlePreviewDirective}
                  disabled={previewingDirective || !directiveInstruction.trim() || selectedBranches.length === 0}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-medium flex items-center gap-1.5"
                >
                  {previewingDirective ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Preview Directive Diff
                </button>
              ) : (
                <button
                  onClick={handleConfirmDirective}
                  disabled={confirmingDirective}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-semibold flex items-center gap-1.5"
                >
                  {confirmingDirective ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  Confirm & Apply Directive
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
