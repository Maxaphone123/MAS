import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { BranchState, BranchStepState } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import {
  GitBranch,
  Play,
  PlayCircle,
  Square,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  FileCode,
  BookOpen
} from 'lucide-react';

export const BranchesPage: React.FC = () => {
  const [branches, setBranches] = useState<BranchState[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [stepOutputs, setStepOutputs] = useState<Record<number, string>>({});
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [isRunnerActive, setIsRunnerActive] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const loadBranches = async (autoSelect = true) => {
    try {
      setLoading(true);
      const data = await api.getBranches();
      setBranches(data);

      if (data.length > 0) {
        const slug = autoSelect && !selectedSlug ? data[0].slug : (selectedSlug || data[0].slug);
        setSelectedSlug(slug);
        loadBranchDetails(slug);
      }
    } catch (err: any) {
      console.error('Failed to load branches:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBranchDetails = async (slug: string) => {
    try {
      const res = await api.getBranch(slug);
      setStepOutputs(res.outputs || {});
      // Auto-expand in_progress or current step
      const cur = res.state.currentStep;
      setExpandedSteps(prev => ({ ...prev, [cur]: true }));
    } catch (err) {
      console.error('Failed to load branch details:', err);
    }
  };

  const checkRunner = async () => {
    try {
      const status = await api.getRunnerStatus();
      setIsRunnerActive(status.isRunning);
    } catch {}
  };

  useEffect(() => {
    loadBranches();
    const interval = setInterval(checkRunner, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectBranch = (slug: string) => {
    setSelectedSlug(slug);
    loadBranchDetails(slug);
  };

  const toggleStepExpand = (stepNum: number) => {
    setExpandedSteps(prev => ({ ...prev, [stepNum]: !prev[stepNum] }));
  };

  const handleRunNextStep = async () => {
    if (!selectedSlug) return;
    setRunningAction('next');
    setErrorBanner(null);
    try {
      const res = await api.runNextStep(selectedSlug);
      if (res.ok) {
        await loadBranches(false);
        await loadBranchDetails(selectedSlug);
      } else {
        setErrorBanner(res.error || 'Failed to run step.');
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Execution error.');
    } finally {
      setRunningAction(null);
    }
  };

  const handleRunBranch = async () => {
    if (!selectedSlug) return;
    setRunningAction('branch');
    setErrorBanner(null);
    try {
      const res = await api.runBranch(selectedSlug);
      if (res.ok) {
        await loadBranches(false);
        await loadBranchDetails(selectedSlug);
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Execution error during branch run.');
    } finally {
      setRunningAction(null);
    }
  };

  const handleRunAllBranches = async () => {
    setRunningAction('all');
    setErrorBanner(null);
    try {
      const res = await api.runAllBranches();
      if (res.ok) {
        await loadBranches(false);
        if (selectedSlug) await loadBranchDetails(selectedSlug);
      }
    } catch (err: any) {
      setErrorBanner(err.message || 'Error running all branches.');
    } finally {
      setRunningAction(null);
    }
  };

  const handleStop = async () => {
    try {
      await api.stopRunners();
      setIsRunnerActive(false);
    } catch (err: any) {
      alert('Failed to request stop: ' + err.message);
    }
  };

  const activeBranch = branches.find(b => b.slug === selectedSlug);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-emerald-400" />
            Branch Execution Dashboard (Stage 3)
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Isolated execution per branch (Contract 6.3–6.5). Steps run strictly sequentially.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadBranches(false)}
            disabled={loading}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors"
            title="Refresh branches"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {isRunnerActive || runningAction ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold shadow-sm transition-all"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Execution
            </button>
          ) : (
            <button
              onClick={handleRunAllBranches}
              disabled={branches.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-medium shadow-sm transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Run All Branches
            </button>
          )}
        </div>
      </div>

      {errorBanner && (
        <div className="flex items-center gap-2 p-3 bg-red-950/40 border border-red-900/60 rounded text-xs text-red-300">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {branches.length === 0 ? (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
            <GitBranch className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-300">No Branches Available</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Go to Orchestrator chat and click "Create plan from discussion" or upload a plan to populate branches.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left column: Branch selection tabs */}
          <div className="lg:col-span-1 space-y-2">
            <span className="text-[11px] font-mono text-zinc-500 uppercase px-1">Active Branches ({branches.length})</span>
            <div className="space-y-1.5">
              {branches.map((b) => {
                const isSelected = b.slug === selectedSlug;
                const doneCount = b.steps.filter(s => s.status === 'done').length;
                const totalCount = b.steps.length;
                const hasBlocked = b.steps.some(s => s.status === 'blocked');

                return (
                  <button
                    key={b.slug}
                    onClick={() => handleSelectBranch(b.slug)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-zinc-800/90 border-emerald-500/50 shadow-sm'
                        : 'bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-800/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200">{b.name}</span>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-zinc-950 text-zinc-400 border border-zinc-800">
                        {b.role}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span>Progress: {doneCount}/{totalCount}</span>
                      {hasBlocked ? (
                        <span className="text-red-400">Blocked</span>
                      ) : doneCount === totalCount ? (
                        <span className="text-emerald-400">Done</span>
                      ) : (
                        <span className="text-amber-400">In Progress</span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-zinc-950 h-1.5 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          hasBlocked ? 'bg-red-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${(doneCount / (totalCount || 1)) * 100}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right column: Active branch steps & runner */}
          <div className="lg:col-span-3 space-y-6">
            {activeBranch ? (
              <>
                {/* Branch Header card */}
                <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-zinc-100">{activeBranch.name}</h2>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-zinc-800 text-emerald-400 border border-zinc-700">
                          role: {activeBranch.role}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">{activeBranch.branchGoal}</p>
                    </div>

                    {/* Action buttons for this branch */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRunNextStep}
                        disabled={runningAction !== null || isRunnerActive}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-600 disabled:opacity-50 text-white rounded text-xs font-medium shadow-sm transition-all"
                      >
                        {runningAction === 'next' ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        Run Next Step
                      </button>

                      <button
                        onClick={handleRunBranch}
                        disabled={runningAction !== null || isRunnerActive}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 border border-zinc-700 rounded text-xs font-medium transition-all"
                      >
                        {runningAction === 'branch' ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <PlayCircle className="w-3.5 h-3.5" />
                        )}
                        Run Branch
                      </button>
                    </div>
                  </div>
                </div>

                {/* Steps List */}
                <div className="space-y-3">
                  <h3 className="text-xs font-mono uppercase text-zinc-400 px-1">
                    Steps Breakdown ({activeBranch.steps.length})
                  </h3>

                  {activeBranch.steps.map((st: BranchStepState) => {
                    const isExpanded = !!expandedSteps[st.n];
                    const outputContent = stepOutputs[st.n];

                    return (
                      <div
                        key={st.n}
                        className={`bg-zinc-900/60 border rounded-lg transition-all ${
                          st.status === 'in_progress'
                            ? 'border-amber-500/60 shadow-sm'
                            : st.status === 'blocked'
                            ? 'border-red-900/60'
                            : 'border-zinc-800'
                        }`}
                      >
                        <div
                          onClick={() => toggleStepExpand(st.n)}
                          className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-800/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-zinc-300">
                                  Step {st.n}:
                                </span>
                                <span className="text-xs font-medium text-zinc-100">{st.title}</span>
                              </div>
                              <span className="text-[11px] text-zinc-500 font-mono mt-0.5 block">
                                type: {st.type} • complexity: {st.complexity}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {st.modelUsed && (
                              <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 hidden sm:inline">
                                {st.modelUsed}
                              </span>
                            )}
                            {st.review && st.review.reviewState && (
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
                                  st.review.reviewState === 'pass'
                                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60'
                                    : st.review.reviewState === 'fail'
                                    ? 'bg-red-950/60 text-red-300 border-red-700/60'
                                    : st.review.reviewState === 'reworking'
                                    ? 'bg-amber-950/60 text-amber-300 border-amber-700/60'
                                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                                }`}
                                title={st.review.reviewerModel ? `Reviewed by ${st.review.reviewerModel}` : 'Review status'}
                              >
                                {st.review.reviewState === 'pass' && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                                {st.review.reviewState === 'fail' && <AlertCircle className="w-3 h-3 text-red-400" />}
                                Review: {st.review.reviewState.toUpperCase()}
                                {st.review.reworkCount > 0 && ` (${st.review.reworkCount} rework)`}
                              </span>
                            )}
                            <StatusBadge status={st.status} />
                          </div>
                        </div>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-5 pb-5 pt-1 border-t border-zinc-800/60 space-y-3 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                              <div className="bg-zinc-950/60 p-3 rounded border border-zinc-800/60">
                                <span className="text-zinc-500 font-mono text-[10px] uppercase block mb-1">
                                  Description
                                </span>
                                <p className="text-zinc-300 leading-relaxed">{st.description}</p>
                              </div>
                              <div className="bg-zinc-950/60 p-3 rounded border border-zinc-800/60">
                                <span className="text-zinc-500 font-mono text-[10px] uppercase block mb-1">
                                  Acceptance Criteria
                                </span>
                                <p className="text-zinc-300 leading-relaxed">{st.acceptanceCriteria}</p>
                              </div>
                            </div>

                            {/* Review Report Details (Rule 7.8) */}
                            {st.review && st.review.problems && st.review.problems.length > 0 && (
                              <div className="p-3 bg-zinc-950 rounded border border-zinc-800 space-y-1.5">
                                <span className="text-[10px] uppercase font-mono text-amber-400 font-semibold block">
                                  Reviewer Feedback ({st.review.reviewerModel || 'Reviewer'}):
                                </span>
                                <ul className="space-y-1 text-xs text-zinc-300 font-mono pl-1">
                                  {st.review.problems.map((p: any, pIdx: number) => (
                                    <li key={pIdx} className="flex items-start gap-1.5">
                                      <span className={`text-[10px] px-1 rounded uppercase ${
                                        p.severity === 'high' ? 'bg-red-950 text-red-400' : 'bg-amber-950 text-amber-400'
                                      }`}>
                                        [{p.severity}]
                                      </span>
                                      <span>{p.text}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}


                            {/* Blocked reason banner */}
                            {st.status === 'blocked' && st.blockedReason && (
                              <div className="p-3 bg-red-950/40 border border-red-900/60 rounded text-red-300 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                <div>
                                  <strong className="block text-[11px] uppercase font-mono text-red-400">
                                    Step Blocked
                                  </strong>
                                  <p>{st.blockedReason}</p>
                                </div>
                              </div>
                            )}

                            {/* Completed Result Output */}
                            {st.status === 'done' && outputContent && (
                              <div className="space-y-1.5 pt-2">
                                <span className="text-zinc-400 font-mono text-[10px] uppercase flex items-center gap-1.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                  Execution Output (outputs/step-{st.n}.md):
                                </span>
                                <pre className="p-3 bg-zinc-950/80 rounded border border-zinc-800/80 font-mono text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                                  {outputContent}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Branch Decisions Log (Rule 6.3) */}
                <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-2">
                  <h4 className="text-xs font-mono uppercase text-zinc-400 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                    Branch Decisions Log ({activeBranch.decisions.length})
                  </h4>
                  {activeBranch.decisions.length === 0 ? (
                    <p className="text-xs text-zinc-500 italic">No decisions recorded yet.</p>
                  ) : (
                    <ul className="space-y-1 text-xs text-zinc-300 font-mono pl-2">
                      {activeBranch.decisions.map((dec, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-emerald-400 font-bold">•</span>
                          <span>{dec}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
