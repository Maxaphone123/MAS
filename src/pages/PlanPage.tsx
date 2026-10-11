import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { PlansIndex, PlanMeta } from '../types';
import { FileText, Download, Upload, Edit3, RotateCcw, AlertTriangle, Check, RefreshCw } from 'lucide-react';

export const PlanPage: React.FC = () => {
  const [plansIndex, setPlansIndex] = useState<PlansIndex>({ currentVersion: 0, versions: [] });
  const [selectedVersion, setSelectedVersion] = useState<number>(0);
  const [currentMeta, setCurrentMeta] = useState<PlanMeta | null>(null);
  const [planContent, setPlanContent] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Edit mode
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Upload file ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadPlans = async () => {
    try {
      setLoading(true);
      const index = await api.getPlans();
      setPlansIndex(index);

      if (index.currentVersion > 0) {
        const ver = selectedVersion > 0 ? selectedVersion : index.currentVersion;
        setSelectedVersion(ver);
        const res = await api.getPlanVersion(ver);
        setCurrentMeta(res.meta);
        setPlanContent(res.content);
        setEditContent(res.content);
      } else {
        setCurrentMeta(null);
        setPlanContent('');
        setEditContent('');
      }
    } catch (err) {
      console.error('Failed to load plans:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  const handleSelectVersion = async (ver: number) => {
    setSelectedVersion(ver);
    setIsEditing(false);
    setValidationErrors([]);
    setSuccessNotice(null);
    try {
      const res = await api.getPlanVersion(ver);
      setCurrentMeta(res.meta);
      setPlanContent(res.content);
      setEditContent(res.content);
    } catch (err: any) {
      alert('Failed to load plan version: ' + err.message);
    }
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    setValidationErrors([]);
    setSuccessNotice(null);
    try {
      const res = await api.editPlan(editContent, 'Manual edits');
      if (res.ok && res.meta) {
        setIsEditing(false);
        setSuccessNotice(`Saved as new version v${res.meta.version}`);
        await loadPlans();
        handleSelectVersion(res.meta.version);
      } else {
        setValidationErrors(res.errors || ['Plan format validation failed.']);
      }
    } catch (err: any) {
      setValidationErrors([err.message || 'Error occurred while saving edit.']);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDownload = () => {
    if (!planContent) return;
    const blob = new Blob([planContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan-v${selectedVersion || 1}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      if (!content) return;

      setValidationErrors([]);
      setSuccessNotice(null);
      try {
        const res = await api.uploadPlan(content);
        if (res.ok && res.meta) {
          setSuccessNotice(`Uploaded successfully as version v${res.meta.version}`);
          await loadPlans();
          handleSelectVersion(res.meta.version);
        } else {
          setValidationErrors(res.errors || ['Uploaded plan failed validation.']);
        }
      } catch (err: any) {
        setValidationErrors([err.message || 'Upload failed.']);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRestoreVersion = async () => {
    if (!selectedVersion) return;
    if (!confirm(`Restore version v${selectedVersion} as the new active plan? This will create a new version.`)) return;

    setValidationErrors([]);
    setSuccessNotice(null);
    try {
      const res = await api.restorePlan(selectedVersion);
      if (res.ok && res.meta) {
        setSuccessNotice(`Restored as new active version v${res.meta.version}`);
        await loadPlans();
        handleSelectVersion(res.meta.version);
      } else {
        setValidationErrors(res.errors || ['Failed to restore version.']);
      }
    } catch (err: any) {
      setValidationErrors([err.message || 'Error restoring version.']);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUploadFile}
        accept=".md,.txt"
        className="hidden"
      />

      {/* Header & Version controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            Project Plan (Contract 6.2)
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Immutable, versioned plan contract. Isolated branches and sequential steps.
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Version Selector */}
          {plansIndex.versions.length > 0 && (
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-800 rounded px-2.5 py-1 text-xs">
              <span className="text-zinc-500 font-mono text-[11px]">Version:</span>
              <select
                value={selectedVersion}
                onChange={(e) => handleSelectVersion(parseInt(e.target.value, 10))}
                className="bg-transparent text-emerald-400 font-semibold focus:outline-none cursor-pointer text-xs"
              >
                {plansIndex.versions.map((v) => (
                  <option key={v.version} value={v.version} className="bg-zinc-900 text-zinc-200">
                    v{v.version} ({v.source}) {v.version === plansIndex.currentVersion ? '★ Current' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-400" />
            Upload .md
          </button>

          {planContent && (
            <>
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium border border-zinc-700 transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-zinc-400" />
                Download .md
              </button>

              <button
                onClick={() => {
                  setIsEditing(!isEditing);
                  setEditContent(planContent);
                  setValidationErrors([]);
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                  isEditing
                    ? 'bg-amber-600/20 text-amber-300 border-amber-600/40'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5 text-zinc-400" />
                {isEditing ? 'Cancel Edit' : 'Edit Plan'}
              </button>

              {selectedVersion !== plansIndex.currentVersion && (
                <button
                  onClick={handleRestoreVersion}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-xs font-medium border border-emerald-500/40 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restore as Current
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Success notification */}
      {successNotice && (
        <div className="flex items-center gap-2 p-3 bg-emerald-950/40 border border-emerald-800/60 rounded text-xs text-emerald-300">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Validation Errors banner */}
      {validationErrors.length > 0 && (
        <div className="p-4 bg-red-950/40 border border-red-900/60 rounded text-xs text-red-300 space-y-1.5">
          <div className="flex items-center gap-2 font-semibold text-red-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>Plan Format Validation Errors (Must satisfy Section 7.4):</span>
          </div>
          <ul className="list-disc list-inside space-y-1 pl-2 text-zinc-300">
            {validationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Plan Details / Editor */}
      {plansIndex.versions.length === 0 ? (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
            <FileText className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-300">No Plan Created Yet</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Go to the Orchestrator tab to discuss your project requirements, then click "Create plan from discussion" or upload an existing plan.md.
          </p>
        </div>
      ) : isEditing ? (
        /* Edit Mode */
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Edit Plan Markdown</h2>
            <span className="text-[11px] text-amber-400">Saving creates a new immutable version</span>
          </div>
          <textarea
            rows={22}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-4 font-mono text-xs text-zinc-200 leading-relaxed focus:outline-none focus:border-emerald-500 resize-y"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={savingEdit}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium flex items-center gap-1.5 shadow-sm"
            >
              {savingEdit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
              Save as New Version
            </button>
          </div>
        </div>
      ) : (
        /* Rendered Plan View */
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-6 space-y-6">
          {/* Metadata bar */}
          {currentMeta && (
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-zinc-950/70 border border-zinc-800/80 rounded text-xs font-mono">
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-bold">Plan v{currentMeta.version}</span>
                <span className="text-zinc-500">•</span>
                <span className="text-zinc-400 capitalize">Source: {currentMeta.source}</span>
                {currentMeta.note && (
                  <>
                    <span className="text-zinc-500">•</span>
                    <span className="text-zinc-400">{currentMeta.note}</span>
                  </>
                )}
              </div>
              <span className="text-zinc-500 text-[11px]">
                {new Date(currentMeta.time).toLocaleString()}
              </span>
            </div>
          )}

          {/* Formatted Markdown Content */}
          <div className="prose prose-invert max-w-none font-sans text-xs space-y-4">
            <pre className="p-4 bg-zinc-950/80 border border-zinc-800/60 rounded-lg font-mono text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {planContent}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
