import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { ProjectFileMeta, AuditReport } from '../types';
import {
  FolderGit2,
  Download,
  Trash2,
  ExternalLink,
  RefreshCw,
  FileCode,
  Image as ImageIcon,
  CheckCircle2,
  Eye,
  Code2,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export const ProjectPage: React.FC = () => {
  const [filesMap, setFilesMap] = useState<Record<string, ProjectFileMeta>>({});
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'code' | 'preview' | 'audit'>('code');

  // Audit state (Stage 7B)
  const [auditReport, setAuditReport] = useState<AuditReport | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [applyingDirective, setApplyingDirective] = useState<string | null>(null);
  const [directiveSuccess, setDirectiveSuccess] = useState<string | null>(null);

  const loadFiles = async (autoSelect = true) => {
    try {
      setLoading(true);
      const map = await api.getProjectFiles();
      setFilesMap(map);

      const paths = Object.keys(map);
      if (paths.length > 0) {
        const nextPath = autoSelect && !selectedPath ? paths[0] : (selectedPath || paths[0]);
        setSelectedPath(nextPath);
        loadFileContent(nextPath);
      } else {
        setSelectedPath('');
        setFileContent('');
      }
    } catch (err) {
      console.error('Failed to load project files:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadFileContent = async (path: string) => {
    try {
      if (path.startsWith('assets/') || /\.(png|jpe?g|gif|webp|svg|ico)$/i.test(path)) {
        setFileContent(''); // image handled via direct img src
        return;
      }
      const res = await api.getProjectFileContent(path);
      setFileContent(res.content || '');
    } catch (err) {
      console.error('Failed to load file content:', err);
    }
  };

  const runAudit = async () => {
    try {
      setAuditing(true);
      const report = await api.getProjectAudit();
      setAuditReport(report);
    } catch (err) {
      console.error('Audit failed:', err);
    } finally {
      setAuditing(false);
    }
  };

  useEffect(() => {
    loadFiles();
    runAudit();
  }, []);

  const handleSelectFile = (path: string) => {
    setSelectedPath(path);
    loadFileContent(path);
  };

  const handleClearProject = async () => {
    if (!confirm('Are you sure you want to clear the project files? This will delete all files in project/current and files.json.')) {
      return;
    }
    await api.clearProject();
    await loadFiles();
    await runAudit();
  };

  const handleDownloadZip = () => {
    window.location.href = '/api/project/zip';
  };

  const handleApplyAuditDirective = async (branch: string, suggestion: string) => {
    try {
      setApplyingDirective(suggestion);
      setDirectiveSuccess(null);
      const res = await api.applyAuditDirective(branch, suggestion);
      if (res.ok) {
        setDirectiveSuccess(`Directive created! Active plan upgraded to v${res.version}.`);
        await runAudit();
      } else {
        alert(res.error || 'Failed to apply directive.');
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setApplyingDirective(null);
    }
  };

  const fileKeys = Object.keys(filesMap);
  const selectedMeta = selectedPath ? filesMap[selectedPath] : null;
  const hasIndexHtml = fileKeys.includes('index.html');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <FolderGit2 className="w-5 h-5 text-emerald-400" />
            Project File Assembly & Quality Audit (Stage 4 & 7B)
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Aggregated deliverables across branches, sandboxed iframe preview, static syntax verification, and directive suggestions.
          </p>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle (Code vs Sandboxed Preview vs Quality Audit) */}
          <div className="flex rounded-md bg-zinc-950 border border-zinc-800 p-0.5 text-xs font-medium">
            <button
              onClick={() => setViewMode('code')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                viewMode === 'code' ? 'bg-zinc-800 text-zinc-100 font-semibold' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              Files & Code
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                viewMode === 'preview' ? 'bg-emerald-600/30 text-emerald-300 font-semibold border border-emerald-500/30' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Live Preview
            </button>
            <button
              onClick={() => {
                setViewMode('audit');
                runAudit();
              }}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-colors ${
                viewMode === 'audit' ? 'bg-purple-600/30 text-purple-300 font-semibold border border-purple-500/30' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Quality Audit (7B)
              {auditReport && (
                <span className={`text-[10px] px-1 rounded font-mono ${
                  auditReport.passed ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
                }`}>
                  {auditReport.score}%
                </span>
              )}
            </button>
          </div>

          <button
            onClick={() => {
              loadFiles(false);
              runAudit();
            }}
            disabled={loading || auditing}
            className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors"
            title="Refresh files & audit"
          >
            <RefreshCw className={`w-4 h-4 ${loading || auditing ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleDownloadZip}
            disabled={fileKeys.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-medium shadow-sm transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Download ZIP
          </button>

          <button
            onClick={handleClearProject}
            disabled={fileKeys.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-red-950/60 hover:text-red-400 text-zinc-400 rounded text-xs font-medium border border-zinc-700 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Project
          </button>
        </div>
      </div>

      {fileKeys.length === 0 ? (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-16 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-500 mx-auto">
            <FolderGit2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-zinc-300">Project Directory is Empty</h3>
          <p className="text-xs text-zinc-500 max-w-md mx-auto">
            Run steps on the Branches tab that produce files (code, styles, assets). The assembly engine will place them in /data/project/current.
          </p>
        </div>
      ) : viewMode === 'audit' ? (
        /* Quality Audit & Review Panel (Stage 7B) */
        <div className="space-y-6">
          {directiveSuccess && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-800/80 rounded text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{directiveSuccess}</span>
            </div>
          )}

          {/* Audit Score Card */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 bg-zinc-900/70 border border-zinc-800 rounded-lg flex items-center justify-between">
              <div>
                <span className="text-[11px] text-zinc-500 uppercase font-mono block">Health Score</span>
                <span className={`text-2xl font-bold font-mono ${
                  (auditReport?.score || 0) >= 80 ? 'text-emerald-400' :
                  (auditReport?.score || 0) >= 50 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {auditReport?.score || 0} / 100
                </span>
              </div>
              <div className={`p-2.5 rounded-full ${
                auditReport?.passed ? 'bg-emerald-950 text-emerald-400' : 'bg-amber-950 text-amber-400'
              }`}>
                <ShieldCheck className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 bg-zinc-900/70 border border-zinc-800 rounded-lg">
              <span className="text-[11px] text-zinc-500 uppercase font-mono block">Entrypoint index.html</span>
              <div className="flex items-center gap-2 mt-1">
                {auditReport?.hasIndexHtml ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-400">Present</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-semibold text-red-400">Missing</span>
                  </>
                )}
              </div>
            </div>

            <div className="p-5 bg-zinc-900/70 border border-zinc-800 rounded-lg">
              <span className="text-[11px] text-zinc-500 uppercase font-mono block">Syntax Issues</span>
              <div className="flex items-center gap-2 mt-1">
                {auditReport && auditReport.syntaxProblems.length === 0 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-400">Clean (0 errors)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span className="text-sm font-semibold text-amber-400">
                      {auditReport?.syntaxProblems.length} issue(s)
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="p-5 bg-zinc-900/70 border border-zinc-800 rounded-lg">
              <span className="text-[11px] text-zinc-500 uppercase font-mono block">Broken References</span>
              <div className="flex items-center gap-2 mt-1">
                {auditReport && auditReport.brokenReferences.length === 0 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm font-semibold text-emerald-400">0 broken links</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-semibold text-red-400">
                      {auditReport?.brokenReferences.length} missing asset(s)
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Suggested Directives section (One-click fixes from Audit) */}
          {auditReport && auditReport.suggestedDirectives.length > 0 && (
            <div className="bg-zinc-900/70 border border-purple-900/50 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <h3 className="text-sm font-semibold text-zinc-200">
                  Audit Recommended Directives ({auditReport.suggestedDirectives.length})
                </h3>
              </div>
              <p className="text-xs text-zinc-400">
                The reviewer detected architectural or reference gaps. Click to generate and apply a targeted directive to the owning branch.
              </p>

              <div className="space-y-2">
                {auditReport.suggestedDirectives.map((sd, i) => (
                  <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded text-xs gap-3">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/60 inline-block">
                        Target Branch: {sd.branch}
                      </span>
                      <p className="text-zinc-200 font-medium">{sd.suggestion}</p>
                    </div>

                    <button
                      onClick={() => handleApplyAuditDirective(sd.branch, sd.suggestion)}
                      disabled={applyingDirective === sd.suggestion}
                      className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded text-xs font-medium flex items-center gap-1.5 self-start sm:self-center shrink-0"
                    >
                      {applyingDirective === sd.suggestion ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ArrowRight className="w-3.5 h-3.5" />
                      )}
                      Apply as Directive
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Static Problems & Broken References Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-5 space-y-3">
              <h4 className="text-xs font-mono uppercase text-zinc-400">
                Static Code Problems ({auditReport?.staticProblems.length || 0})
              </h4>
              {(!auditReport?.staticProblems || auditReport.staticProblems.length === 0) ? (
                <p className="text-xs text-emerald-400">✓ No static syntax errors found in project files.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {auditReport.staticProblems.map((sp, idx) => (
                    <div key={idx} className="p-2.5 bg-zinc-950 rounded border border-zinc-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-zinc-300 font-semibold">{sp.file}</span>
                        <span className={`text-[10px] uppercase font-mono px-1 rounded ${
                          sp.severity === 'high' ? 'bg-red-950 text-red-400' : 'bg-amber-950 text-amber-400'
                        }`}>
                          {sp.severity}
                        </span>
                      </div>
                      <p className="text-zinc-400 font-mono text-[11px]">{sp.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-5 space-y-3">
              <h4 className="text-xs font-mono uppercase text-zinc-400">
                Asset & Reference Consistency ({auditReport?.brokenReferences.length || 0})
              </h4>
              {(!auditReport?.brokenReferences || auditReport.brokenReferences.length === 0) ? (
                <p className="text-xs text-emerald-400">✓ All HTML script tags, stylesheets, and images point to valid files.</p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {auditReport.brokenReferences.map((br, idx) => (
                    <div key={idx} className="p-2.5 bg-zinc-950 rounded border border-zinc-800 text-xs">
                      <span className="font-mono text-zinc-300 block">From: {br.fromFile}</span>
                      <span className="text-red-400 font-mono text-[11px] block mt-0.5">
                        Missing path: <code>{br.referencedPath}</code>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : viewMode === 'preview' ? (
        /* Sandboxed Iframe Preview (Rule 6.8: allow-scripts, WITHOUT allow-same-origin) */
        <div className="bg-zinc-900/70 border border-zinc-800 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <div className="flex items-center gap-2 text-xs text-zinc-300 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
              <span>Sandboxed Preview: /index.html</span>
              <span className="text-[10px] text-zinc-500">(sandbox: allow-scripts, no same-origin)</span>
            </div>
            {hasIndexHtml && (
              <a
                href="/api/project/preview/index.html"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                <span>Open in new tab</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>

          <div className="w-full h-[650px] bg-white rounded border border-zinc-800 overflow-hidden shadow-inner">
            <iframe
              src="/api/project/preview/index.html"
              title="Project Sandboxed Preview"
              sandbox="allow-scripts"
              className="w-full h-full border-0"
            />
          </div>
        </div>
      ) : (
        /* File Tree & Code Viewer */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* File Tree Left Pane */}
          <div className="lg:col-span-1 bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 space-y-2">
            <span className="text-[11px] font-mono text-zinc-500 uppercase px-1 block">
              Project Files ({fileKeys.length})
            </span>
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {fileKeys.map((p) => {
                const meta = filesMap[p];
                const isSelected = p === selectedPath;
                const isImg = meta.isImage;

                return (
                  <button
                    key={p}
                    onClick={() => handleSelectFile(p)}
                    className={`w-full text-left p-2 rounded text-xs transition-all flex items-center justify-between ${
                      isSelected
                        ? 'bg-zinc-800 text-emerald-300 font-semibold border border-zinc-700'
                        : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      {isImg ? (
                        <ImageIcon className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      ) : (
                        <FileCode className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span className="truncate font-mono">{p}</span>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-mono ml-2 shrink-0">
                      {Math.round(meta.size / 1024 * 10) / 10}KB
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Code Viewer Right Pane */}
          <div className="lg:col-span-3 bg-zinc-900/70 border border-zinc-800 rounded-lg p-5 space-y-4">
            {selectedMeta && (
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-bold text-zinc-200">{selectedMeta.path}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-950 text-emerald-400 border border-zinc-800">
                    Owner: {selectedMeta.ownerBranch} (Step {selectedMeta.step})
                  </span>
                </div>
                <span className="text-zinc-500 text-[11px] font-mono">
                  {new Date(selectedMeta.time).toLocaleTimeString()}
                </span>
              </div>
            )}

            {selectedMeta?.isImage ? (
              /* Image asset viewer */
              <div className="flex flex-col items-center justify-center p-8 bg-zinc-950/80 rounded-lg border border-zinc-800 space-y-3">
                <img
                  src={`/api/project/file?path=${encodeURIComponent(selectedPath)}`}
                  alt={selectedPath}
                  className="max-h-[450px] max-w-full rounded shadow-lg object-contain border border-zinc-800"
                />
                <span className="text-xs font-mono text-zinc-400">{selectedPath}</span>
              </div>
            ) : (
              /* Text / Code viewer */
              <div className="space-y-1">
                <pre className="p-4 bg-zinc-950/80 rounded-lg border border-zinc-800 font-mono text-xs text-zinc-300 overflow-x-auto max-h-[580px] overflow-y-auto whitespace-pre leading-relaxed">
                  {fileContent || '(Empty file)'}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
