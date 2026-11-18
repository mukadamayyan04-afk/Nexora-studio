import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Cpu,
  Download,
  FileCode2,
  FilePlus2,
  FileText,
  FlaskConical,
  FolderGit2,
  GitCompare,
  Hammer,
  History,
  KeyRound,
  Loader2,
  Maximize2,
  MessageSquare,
  Monitor,
  Pencil,
  Play,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  Server,
  Smartphone,
  Sparkles,
  Square,
  Tablet,
  Terminal,
  Trash2,
  Undo2,
  Upload,
  Wrench,
  X,
} from 'lucide-react';
import type {
  AIProviderConfig,
  ErrorFixProposal,
  FreeFallbackOption,
  NexoraProject,
  ProjectEnvVar,
  ProjectRuntimeStatus,
  ProjectVersion,
} from '../types/nexora';
import { ExportCenterModal } from './ExportCenterModal';
import { GitHubPanel } from './GitHubPanel';
import { NexoraLogo } from './NexoraLogo';

interface FileDiffItem {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  addedLines: number;
  removedLines: number;
  previewLines: Array<{ type: '+' | '-' | ' '; text: string }>;
}

interface ProjectWorkspaceViewProps {
  project: NexoraProject | null;
  isLoadingProject?: boolean;
  missingProjectId?: string | null;
  providers: AIProviderConfig[];
  editorTabSize?: 2 | 4;
  autoSaveOnBlur?: boolean;
  compactDensity?: boolean;
  onProjectUpdated: (project: NexoraProject) => void;
  onSaveFile: (projectId: string, path: string, content: string) => Promise<void>;
  onSaveProjectSnapshot: (projectId: string) => Promise<void>;
  onApproveAsset: (projectId: string, assetId: string) => Promise<void>;
  onSendChat: (
    projectId: string,
    message: string,
    activeFilePath?: string,
    selectedModelId?: string,
    smartRouting?: boolean
  ) => Promise<void>;
  onRetryGeneration: (projectId: string, modelId?: string) => Promise<void>;
  onRenameProject: (projectId: string, name: string) => Promise<void>;
  onDuplicateProject: (projectId: string) => Promise<void>;
  onRunBuild: (projectId: string) => Promise<void>;
  onGoHome: () => void;
  onGoProjects: () => void;
  onOpenModelHub: () => void;
  onOpenSettings?: () => void;
  onToast?: (msg: string) => void;
}

export const ProjectWorkspaceView: React.FC<ProjectWorkspaceViewProps> = ({
  project,
  isLoadingProject = false,
  missingProjectId = null,
  providers,
  editorTabSize = 2,
  autoSaveOnBlur = false,
  compactDensity = false,
  onProjectUpdated,
  onSaveFile,
  onSaveProjectSnapshot,
  onApproveAsset,
  onSendChat,
  onRetryGeneration,
  onRenameProject,
  onDuplicateProject,
  onRunBuild,
  onGoHome,
  onGoProjects,
  onOpenModelHub,
  onOpenSettings,
  onToast,
}) => {
  const [activeFilePath, setActiveFilePath] = useState<string>('');
  const [editorContent, setEditorContent] = useState<string>('');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  // Left, Bottom, and Right panel tab state
  const [leftTab, setLeftTab] = useState<'files' | 'versions' | 'github'>('files');
  const [bottomTab, setBottomTab] = useState<
    'console' | 'diagnostics' | 'server' | 'fixer' | 'tests'
  >('console');
  const [rightTab, setRightTab] = useState<'preview' | 'chat' | 'assets'>('preview');
  const [previewKey, setPreviewKey] = useState(0);
  const [viewportMode, setViewportMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [previewFullscreen, setPreviewFullscreen] = useState(false);

  // File Explorer actions + Env modal
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [renamingFilePath, setRenamingFilePath] = useState<string | null>(null);
  const [renameFileDraft, setRenameFileDraft] = useState('');
  const [envModalOpen, setEnvModalOpen] = useState(false);
  const [envDraft, setEnvDraft] = useState<ProjectEnvVar[]>([]);
  const [exportCenterOpen, setExportCenterOpen] = useState(false);

  // Version History Diff state
  const [checkpointLabel, setCheckpointLabel] = useState('');
  const [diffModal, setDiffModal] = useState<{
    version: ProjectVersion;
    diffs: FileDiffItem[];
  } | null>(null);

  // Isolated Backend Runtime state
  const [runtime, setRuntime] = useState<ProjectRuntimeStatus | null>(null);
  const [runtimeBusy, setRuntimeBusy] = useState(false);

  // AI Error Fixer state
  const [fixProposal, setFixProposal] = useState<ErrorFixProposal | null>(null);
  const [fixingBusy, setFixingBusy] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);

  // Testing Center state
  const [testingBusy, setTestingBusy] = useState(false);

  // Asset Studio upload
  const assetUploadRef = useRef<HTMLInputElement | null>(null);

  // AI Chat state
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const [chatError, setChatError] = useState<{
    message: string;
    fallbacks?: FreeFallbackOption[];
  } | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);

  const [workspaceModelId, setWorkspaceModelId] = useState(
    project?.selectedModelId || 'gemini-4-hydrogen'
  );
  const [workspaceSmartRoute, setWorkspaceSmartRoute] = useState(project?.smartRouting ?? true);

  const fetchRuntimeStatus = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/runtime`);
      if (res.ok) {
        const data = (await res.json()) as { runtime: ProjectRuntimeStatus };
        setRuntime(data.runtime);
      }
    } catch {
      // ignore transient network check
    }
  }, []);

  useEffect(() => {
    if (!project) return;
    setWorkspaceModelId(project.selectedModelId);
    setWorkspaceSmartRoute(project.smartRouting);
    setRenameDraft(project.name);
    setEnvDraft(project.envVars || []);
    setFixProposal(null);
    setFixError(null);
    const defaultFile =
      project.files.find((f) => f.path.endsWith('MainActivity.kt')) ||
      project.files.find((f) => f.path === 'server.js') ||
      project.files.find((f) => f.path.endsWith('index.html')) ||
      project.files[0];
    if (defaultFile) {
      setActiveFilePath(defaultFile.path);
      setEditorContent(defaultFile.content);
      setIsDirty(false);
    }
    void fetchRuntimeStatus(project.id);
  }, [project?.id, fetchRuntimeStatus]);

  useEffect(() => {
    if (!project || isDirty) return;
    const preferred =
      project.files.find((f) => f.path.endsWith('MainActivity.kt')) ||
      project.files.find((f) => f.path === 'server.js') ||
      project.files.find((f) => f.path.endsWith('index.html')) ||
      project.files[0];
    if (
      project.generationStatus === 'completed' &&
      preferred &&
      (!activeFilePath || activeFilePath === 'README.md')
    ) {
      setActiveFilePath(preferred.path);
      setEditorContent(preferred.content);
      setPreviewKey((k) => k + 1);
      return;
    }
    const current = project.files.find((f) => f.path === activeFilePath);
    if (current && current.content !== editorContent) {
      setEditorContent(current.content);
    }
  }, [project?.files, project?.generationStatus, activeFilePath, isDirty]);

  // Poll runtime logs while server tab is open or server is running
  useEffect(() => {
    if (!project) return;
    if (runtime?.status !== 'running' && bottomTab !== 'server') return;
    const t = window.setInterval(() => {
      void fetchRuntimeStatus(project.id);
    }, 3000);
    return () => window.clearInterval(t);
  }, [project?.id, runtime?.status, bottomTab, fetchRuntimeStatus]);

  if (isLoadingProject) {
    return (
      <div className="flex-1 flex items-center justify-center studio-grid-bg p-6">
        <div className="glass-layer-2 spectral-top-edge rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <NexoraLogo variant="splash" size="lg" className="mx-auto" />
          <div className="flex items-center justify-center gap-2 text-xs text-[#4cd7f6]">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="font-medium">Loading Project Workspace...</span>
          </div>
          <p className="text-xs text-[#958ea0]">
            Restoring files, build console, and saved workspace state.
          </p>
        </div>
      </div>
    );
  }

  if (missingProjectId || !project) {
    return (
      <div className="flex-1 flex items-center justify-center studio-grid-bg p-6">
        <div className="glass-layer-2 rounded-2xl p-8 max-w-md text-center space-y-4">
          <NexoraLogo variant="symbol" size="md" className="mx-auto" />
          <h2 className="font-display text-xl font-semibold text-[#e4e1e9]">
            {missingProjectId ? 'Workspace Not Found' : 'No Active Project Selected'}
          </h2>
          <p className="text-sm text-[#958ea0]">
            {missingProjectId
              ? `No project with ID "${missingProjectId}" was found in your workspace store.`
              : 'Enter a prompt on the Home tab to initialize a project and open its dedicated workspace immediately.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onGoProjects}
              className="btn-kinetic px-4 py-2 rounded-md text-xs font-medium text-[#e4e1e9] cursor-pointer"
            >
              My Projects
            </button>
            <button
              type="button"
              onClick={onGoHome}
              className="btn-synthetic px-5 py-2 rounded-md text-xs font-medium text-white cursor-pointer"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  const availableModels = providers
    .filter((p) => p.status === 'connected')
    .flatMap((p) =>
      p.models
        .filter((m) => m.available && !m.categories.includes('image-gen'))
        .map((m) => ({ ...m, providerName: p.name }))
    );

  const handleSelectFile = (path: string) => {
    const target = project.files.find((f) => f.path === path);
    if (!target) return;
    setActiveFilePath(target.path);
    setEditorContent(target.content);
    setIsDirty(false);
  };

  const handleSaveCurrentFile = async () => {
    setIsSaving(true);
    try {
      if (isDirty && activeFilePath) {
        await onSaveFile(project.id, activeFilePath, editorContent);
        setIsDirty(false);
        setPreviewKey((k) => k + 1);
      } else {
        await onSaveProjectSnapshot(project.id);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateNewFile = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newFilePath.trim().replace(/^\/+/, '');
    if (!clean) return;
    await onSaveFile(project.id, clean, `// ${clean}\n`);
    setNewFilePath('');
    setNewFileOpen(false);
    setActiveFilePath(clean);
    setEditorContent(`// ${clean}\n`);
    setIsDirty(false);
  };

  const handleDeleteFile = async (filePath: string) => {
    const res = await fetch(`/api/projects/${project.id}/files`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath }),
    });
    const data = (await res.json()) as { project?: NexoraProject };
    if (res.ok && data.project) {
      onProjectUpdated(data.project);
      if (activeFilePath === filePath) {
        const next = data.project.files[0];
        setActiveFilePath(next?.path || '');
        setEditorContent(next?.content || '');
        setIsDirty(false);
      }
      onToast?.(`Deleted ${filePath}`);
    }
  };

  const handleRenameFile = async (oldPath: string) => {
    const nextPath = renameFileDraft.trim();
    if (!nextPath || nextPath === oldPath) {
      setRenamingFilePath(null);
      return;
    }
    const res = await fetch(`/api/projects/${project.id}/files/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath: nextPath }),
    });
    const data = (await res.json()) as { project?: NexoraProject };
    if (res.ok && data.project) {
      onProjectUpdated(data.project);
      if (activeFilePath === oldPath) setActiveFilePath(nextPath);
      setRenamingFilePath(null);
      onToast?.(`Renamed ${oldPath} -> ${nextPath}`);
    }
  };

  const handleSaveEnvVars = async () => {
    const res = await fetch(`/api/projects/${project.id}/env`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ envVars: envDraft }),
    });
    const data = (await res.json()) as { project?: NexoraProject };
    if (res.ok && data.project) {
      onProjectUpdated(data.project);
      setEnvModalOpen(false);
      onToast?.('Environment variables saved');
    }
  };

  const handleBuild = async () => {
    setIsBuilding(true);
    setBottomTab('console');
    try {
      if (isDirty && activeFilePath) {
        await onSaveFile(project.id, activeFilePath, editorContent);
        setIsDirty(false);
      }
      await onRunBuild(project.id);
    } finally {
      setIsBuilding(false);
    }
  };

  const handleStartServer = async () => {
    setRuntimeBusy(true);
    setBottomTab('server');
    try {
      if (isDirty && activeFilePath) {
        await onSaveFile(project.id, activeFilePath, editorContent);
        setIsDirty(false);
      }
      const res = await fetch(`/api/projects/${project.id}/runtime/start`, { method: 'POST' });
      const data = (await res.json()) as { runtime?: ProjectRuntimeStatus; error?: string };
      if (res.ok && data.runtime) {
        setRuntime(data.runtime);
        setPreviewKey((k) => k + 1);
        onToast?.(
          data.runtime.port
            ? `Isolated backend running on port ${data.runtime.port}`
            : 'Static preview server active'
        );
      } else if (data.error) {
        onToast?.(data.error);
      }
    } finally {
      setRuntimeBusy(false);
    }
  };

  const handleStopServer = async () => {
    setRuntimeBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/runtime/stop`, { method: 'POST' });
      const data = (await res.json()) as { runtime?: ProjectRuntimeStatus };
      if (res.ok && data.runtime) {
        setRuntime(data.runtime);
        setPreviewKey((k) => k + 1);
        onToast?.('Backend server stopped');
      }
    } finally {
      setRuntimeBusy(false);
    }
  };

  const handleRunTests = async () => {
    setTestingBusy(true);
    setBottomTab('tests');
    try {
      if (isDirty && activeFilePath) {
        await onSaveFile(project.id, activeFilePath, editorContent);
        setIsDirty(false);
      }
      const res = await fetch(`/api/projects/${project.id}/tests/run`, { method: 'POST' });
      const data = (await res.json()) as { project?: NexoraProject; testRun?: { status: string; passedCount: number; total: number } };
      if (res.ok && data.project) {
        onProjectUpdated(data.project);
        if (data.testRun) {
          onToast?.(`Tests: ${data.testRun.passedCount}/${data.testRun.total} passed`);
        }
      }
    } finally {
      setTestingBusy(false);
    }
  };

  const handleDiagnoseErrors = async () => {
    setFixingBusy(true);
    setFixError(null);
    setBottomTab('fixer');
    try {
      const res = await fetch(`/api/projects/${project.id}/errors/diagnose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedModelId: workspaceModelId,
          smartRouting: workspaceSmartRoute,
        }),
      });
      const data = (await res.json()) as { proposal?: ErrorFixProposal; error?: string };
      if (!res.ok || !data.proposal) throw new Error(data.error || 'Diagnosis failed');
      setFixProposal(data.proposal);
    } catch (err) {
      setFixError(err instanceof Error ? err.message : String(err));
    } finally {
      setFixingBusy(false);
    }
  };

  const handleApplyFix = async () => {
    if (!fixProposal) return;
    setFixingBusy(true);
    setFixError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/errors/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal: fixProposal }),
      });
      const data = (await res.json()) as {
        project?: NexoraProject;
        testPassed?: boolean;
        error?: string;
      };
      if (!res.ok || !data.project) throw new Error(data.error || 'Failed to apply fix');
      onProjectUpdated(data.project);
      setFixProposal(null);
      setPreviewKey((k) => k + 1);
      onToast?.(
        data.testPassed
          ? 'Fix applied and verified by test suite'
          : 'Fix applied; check Testing Center for remaining warnings'
      );
    } catch (err) {
      setFixError(err instanceof Error ? err.message : String(err));
    } finally {
      setFixingBusy(false);
    }
  };

  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`/api/projects/${project.id}/versions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: checkpointLabel.trim() || `Checkpoint` }),
    });
    const data = (await res.json()) as { project?: NexoraProject };
    if (res.ok && data.project) {
      onProjectUpdated(data.project);
      setCheckpointLabel('');
      onToast?.('Checkpoint created');
    }
  };

  const handleInspectDiff = async (version: ProjectVersion) => {
    const res = await fetch(`/api/projects/${project.id}/versions/${version.id}/diff`);
    const data = (await res.json()) as { diffs?: FileDiffItem[] };
    if (res.ok) {
      setDiffModal({ version, diffs: data.diffs || [] });
    }
  };

  const handleRestoreVersion = async (versionId: string) => {
    const res = await fetch(`/api/projects/${project.id}/versions/${versionId}/restore`, {
      method: 'POST',
    });
    const data = (await res.json()) as { project?: NexoraProject };
    if (res.ok && data.project) {
      onProjectUpdated(data.project);
      setDiffModal(null);
      setPreviewKey((k) => k + 1);
      onToast?.('Workspace restored to checkpoint');
    }
  };

  const handleUndo = async () => {
    const res = await fetch(`/api/projects/${project.id}/undo`, { method: 'POST' });
    const data = (await res.json()) as { project?: NexoraProject; error?: string };
    if (res.ok && data.project) {
      onProjectUpdated(data.project);
      setPreviewKey((k) => k + 1);
      onToast?.('Undid last change');
    } else if (data.error) {
      onToast?.(data.error);
    }
  };

  const handleRedo = async () => {
    const res = await fetch(`/api/projects/${project.id}/redo`, { method: 'POST' });
    const data = (await res.json()) as { project?: NexoraProject; error?: string };
    if (res.ok && data.project) {
      onProjectUpdated(data.project);
      setPreviewKey((k) => k + 1);
      onToast?.('Re-applied undone change');
    } else if (data.error) {
      onToast?.(data.error);
    }
  };

  const handleGenerateDocs = async () => {
    const res = await fetch(`/api/projects/${project.id}/docs/generate`, { method: 'POST' });
    const data = (await res.json()) as { project?: NexoraProject };
    if (res.ok && data.project) {
      onProjectUpdated(data.project);
      const readme = data.project.files.find((f) => f.path === 'README.md');
      if (readme) {
        setActiveFilePath('README.md');
        setEditorContent(readme.content);
        setIsDirty(false);
      }
      onToast?.('Generated README.md from workspace structure');
    }
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isSvg = file.name.endsWith('.svg') || file.type === 'image/svg+xml';
    const isAudio = file.type.startsWith('audio/');
    const isFont = /\.(woff2?|ttf|otf)$/i.test(file.name);
    const isJson = file.name.endsWith('.json');

    const content = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      if (isSvg || isJson) reader.readAsText(file);
      else reader.readAsDataURL(file);
    });

    const kind = isAudio
      ? 'audio'
      : isFont
      ? 'font'
      : isJson
      ? '3d-json'
      : isSvg
      ? 'ui-icon'
      : 'texture';

    const targetDir =
      project.type === 'website' ? 'public/assets' : 'app/src/main/assets/sprites';

    const res = await fetch(`/api/projects/${project.id}/assets/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        kind,
        svgMarkup: isSvg || isJson ? content : '',
        dataUrl: isSvg || isJson ? undefined : content,
        mimeType: file.type,
        sizeBytes: file.size,
        targetPath: `${targetDir}/${file.name}`,
      }),
    });
    const data = (await res.json()) as { project?: NexoraProject };
    if (res.ok && data.project) {
      onProjectUpdated(data.project);
      onToast?.(`Uploaded "${file.name}" for review (requires approval to add to source)`);
    }
    if (assetUploadRef.current) assetUploadRef.current.value = '';
  };

  const handleRemoveAsset = async (assetId: string) => {
    const res = await fetch(`/api/projects/${project.id}/assets/${assetId}`, {
      method: 'DELETE',
    });
    const data = (await res.json()) as { project?: NexoraProject };
    if (res.ok && data.project) {
      onProjectUpdated(data.project);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || isChatting) return;
    setIsChatting(true);
    setChatError(null);
    const msg = chatInput.trim();
    setChatInput('');
    try {
      await onSendChat(project.id, msg, activeFilePath, workspaceModelId, workspaceSmartRoute);
      setPreviewKey((k) => k + 1);
    } catch (err) {
      const parsed = err as Error & { fallbacks?: FreeFallbackOption[] };
      setChatError({
        message: parsed.message,
        fallbacks: parsed.fallbacks,
      });
    } finally {
      setIsChatting(false);
    }
  };

  const errorCount = project.build.diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = project.build.diagnostics.filter((d) => d.severity === 'warning').length;
  const lineCount = editorContent.split('\n').length;
  const unapprovedAssets = project.pendingAssets.filter((a) => !a.approved);
  const isGeneratingLive =
    project.generationStatus === 'queued' || project.generationStatus === 'generating';
  const latestTestRun = project.testRuns?.[0];
  const isServerProject = project.type === 'website';
  const useLiveRuntimeProxy =
    isServerProject && runtime?.status === 'running' && Boolean(runtime.previewUrl);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-[#0a0a0f]">
      {/* Workspace Action Header */}
      <div className="glass-layer-1 px-4 py-2 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          {renaming ? (
            <div className="flex items-center gap-1.5">
              <input
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                className="bg-[#0a0a0f] border border-[#06b6d4] rounded px-2 py-1 text-xs text-[#e4e1e9]"
                autoFocus
              />
              <button
                type="button"
                onClick={async () => {
                  if (renameDraft.trim()) {
                    await onRenameProject(project.id, renameDraft.trim());
                  }
                  setRenaming(false);
                }}
                className="p-1 text-[#4cd7f6] cursor-pointer"
                aria-label="Save project name"
              >
                <Check className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setRenaming(false)}
                className="p-1 text-[#958ea0] cursor-pointer"
                aria-label="Cancel rename"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              <h1 className="font-display text-sm sm:text-base font-semibold text-[#e4e1e9] truncate">
                {project.name}
              </h1>
              <button
                type="button"
                onClick={() => {
                  setRenameDraft(project.name);
                  setRenaming(true);
                }}
                aria-label="Rename project"
                className="p-1 rounded text-[#958ea0] hover:text-[#e4e1e9] cursor-pointer"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </div>
          )}

          <span className="font-mono text-xs text-[#4cd7f6]">{project.type}</span>
          <span className="text-xs text-[#cbc3d7] hidden xl:inline">
            · {project.selectedProviderName}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Undo & Redo */}
          <button
            type="button"
            onClick={handleUndo}
            disabled={(project.versions?.length || 0) === 0}
            title="Undo last AI or checkpoint edit"
            aria-label="Undo last change"
            className="btn-kinetic p-1.5 rounded-md text-[#cbc3d7] cursor-pointer disabled:opacity-35"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={(project.redoVersions?.length || 0) === 0}
            title="Redo change"
            aria-label="Redo change"
            className="btn-kinetic p-1.5 rounded-md text-[#cbc3d7] cursor-pointer disabled:opacity-35"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setWorkspaceSmartRoute((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium border cursor-pointer ${
              workspaceSmartRoute
                ? 'bg-[#06b6d4]/15 border-[#06b6d4]/45 text-[#4cd7f6]'
                : 'bg-white/[0.04] border-white/[0.1] text-[#958ea0]'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{workspaceSmartRoute ? 'Auto Free' : 'Manual'}</span>
          </button>

          {!workspaceSmartRoute && (
            <select
              aria-label="Workspace free AI model"
              value={workspaceModelId}
              onChange={(e) => setWorkspaceModelId(e.target.value)}
              className="bg-[#0a0a0f]/90 border border-white/[0.1] rounded-md px-2 py-1.5 text-xs text-[#e4e1e9] max-w-[165px]"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#131318]">
                  {m.providerName} · {m.name}
                </option>
              ))}
            </select>
          )}

          {isServerProject && (
            <button
              type="button"
              disabled={runtimeBusy}
              onClick={runtime?.status === 'running' ? handleStopServer : handleStartServer}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                runtime?.status === 'running'
                  ? 'bg-[#93000a]/45 border border-[#ffb4ab]/45 text-[#ffdad6]'
                  : 'bg-[#06b6d4]/20 border border-[#06b6d4]/50 text-[#4cd7f6]'
              }`}
            >
              {runtime?.status === 'running' ? (
                <>
                  <Square className="w-3 h-3" />
                  <span>Stop Server</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span>{runtimeBusy ? 'Starting...' : 'Run Server'}</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={() => onDuplicateProject(project.id)}
            aria-label="Duplicate project"
            className="btn-kinetic inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs text-[#cbc3d7] cursor-pointer"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleBuild}
            disabled={isBuilding || isGeneratingLive}
            className="btn-synthetic inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white whitespace-nowrap cursor-pointer disabled:opacity-50"
          >
            <Hammer className="w-3.5 h-3.5" />
            <span>
              {isBuilding ? 'Building...' : project.type === 'website' ? 'Validate' : 'Build APK'}
            </span>
          </button>

          {project.build.apkAvailable && (
            <a
              href={`/api/projects/${project.id}/apk`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-[#06b6d4] text-[#001f26] hover:brightness-110 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download APK</span>
            </a>
          )}

          <button
            type="button"
            onClick={() => setExportCenterOpen(true)}
            className="btn-kinetic inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-[#e4e1e9] whitespace-nowrap cursor-pointer"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* Real-Time Generation Progress / Provider Error Banners */}
      {isGeneratingLive && (
        <div className="px-4 py-2 bg-[#1b1b25] border-b border-[#8b5cf6]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-[#e4e1e9]">
            <Loader2 className="w-4 h-4 text-[#4cd7f6] animate-spin shrink-0" />
            <span className="font-medium">{project.generationStep}</span>
          </div>
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="flex-1 h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#8b5cf6] to-[#06b6d4] transition-all duration-300"
                style={{ width: `${project.generationProgress}%` }}
              />
            </div>
            <span className="font-mono text-xs text-[#4cd7f6] tabular-nums">
              {project.generationProgress}%
            </span>
          </div>
        </div>
      )}

      {project.generationStatus === 'awaiting_provider' && (
        <div className="px-4 py-2.5 bg-[#1b1b25] border-b border-[#06b6d4]/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-xs text-[#e4e1e9]">
            <AlertTriangle className="w-4 h-4 text-[#4cd7f6] shrink-0 mt-0.5" />
            <span>
              <strong>Workspace Ready — AI Generation Unavailable: </strong>
              {project.generationError || 'Connect an AI provider in AI Models to generate files.'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onOpenModelHub}
              className="btn-kinetic px-3 py-1 rounded text-xs text-[#4cd7f6] cursor-pointer"
            >
              Open AI Models
            </button>
            <button
              type="button"
              onClick={() => onRetryGeneration(project.id)}
              className="btn-synthetic px-3 py-1 rounded text-xs text-white cursor-pointer"
            >
              Retry AI Generation
            </button>
          </div>
        </div>
      )}

      {project.generationStatus === 'error' && project.generationError && (
        <div className="px-4 py-2.5 bg-[#93000a]/25 border-b border-[#ffb4ab]/35 space-y-2">
          <div className="flex items-start justify-between gap-3 text-xs text-[#ffdad6]">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-[#ffb4ab] shrink-0 mt-0.5" />
              <span>
                <strong>Generation Error: </strong>
                {project.generationError}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onRetryGeneration(project.id)}
              className="btn-kinetic px-2.5 py-1 rounded text-xs text-[#e4e1e9] shrink-0 cursor-pointer"
            >
              Retry Current
            </button>
          </div>
          {project.fallbackSuggestions && project.fallbackSuggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#cbc3d7]">Available free-compatible alternatives:</span>
              {project.fallbackSuggestions.map((alt) => (
                <button
                  key={alt.modelId}
                  type="button"
                  onClick={() => onRetryGeneration(project.id, alt.modelId)}
                  className="px-2.5 py-1 rounded bg-[#06b6d4]/20 border border-[#06b6d4]/50 text-[#4cd7f6] cursor-pointer"
                >
                  Retry with {alt.providerName} · {alt.modelName}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main 3-Column IDE Grid */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-y-auto lg:overflow-hidden">
        {/* Left: Files / Versions / GitHub */}
        <aside className="w-full lg:w-[255px] glass-layer-1 border-b lg:border-b-0 lg:border-r border-white/[0.06] flex flex-col shrink-0">
          <div className="h-10 px-2 border-b border-white/[0.06] flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'files', label: 'Files', icon: FileCode2 },
                  { id: 'versions', label: 'Versions', icon: History },
                  { id: 'github', label: 'GitHub', icon: FolderGit2 },
                ] as const
              ).map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setLeftTab(t.id)}
                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                      leftTab === t.id
                        ? 'bg-[#8b5cf6]/20 text-[#e4e1e9]'
                        : 'text-[#958ea0] hover:text-[#e4e1e9]'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {leftTab === 'files' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-2.5 py-2 border-b border-white/[0.05] flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => setNewFileOpen((p) => !p)}
                  className="inline-flex items-center gap-1 text-[11px] text-[#4cd7f6] hover:underline cursor-pointer"
                >
                  <FilePlus2 className="w-3.5 h-3.5" />
                  <span>New File</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEnvDraft(project.envVars || []);
                    setEnvModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 text-[11px] text-[#d0bcff] hover:underline cursor-pointer"
                >
                  <KeyRound className="w-3 h-3" />
                  <span>.env ({project.envVars?.length || 0})</span>
                </button>
              </div>

              {newFileOpen && (
                <form onSubmit={handleCreateNewFile} className="p-2 border-b border-white/[0.06] flex gap-1">
                  <input
                    value={newFilePath}
                    onChange={(e) => setNewFilePath(e.target.value)}
                    placeholder="src/routes.js"
                    className="flex-1 min-w-0 bg-[#0a0a0f] border border-[#06b6d4] rounded px-2 py-1 text-[11px] text-[#e4e1e9]"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 rounded bg-[#8b5cf6] text-white text-[11px] cursor-pointer"
                  >
                    Add
                  </button>
                </form>
              )}

              <div className="flex-1 overflow-y-auto p-2 space-y-0.5 max-h-56 lg:max-h-none">
                {project.files.map((file) => {
                  const active = file.path === activeFilePath;
                  const isRenamingThis = renamingFilePath === file.path;
                  return (
                    <div
                      key={file.path}
                      className={`group flex items-center justify-between gap-1 px-2 py-1.5 rounded-md font-mono text-[11px] transition-colors ${
                        active
                          ? 'bg-[#8b5cf6]/20 text-[#e4e1e9] border border-[#8b5cf6]/45'
                          : 'text-[#cbc3d7] hover:bg-white/[0.04] border border-transparent'
                      }`}
                    >
                      {isRenamingThis ? (
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <input
                            value={renameFileDraft}
                            onChange={(e) => setRenameFileDraft(e.target.value)}
                            className="flex-1 min-w-0 bg-[#0a0a0f] border border-[#06b6d4] rounded px-1.5 py-0.5 text-[11px]"
                            autoFocus
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameFile(file.path)}
                            className="text-[#4cd7f6] cursor-pointer"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => handleSelectFile(file.path)}
                            className="flex items-center gap-1.5 flex-1 min-w-0 text-left cursor-pointer"
                          >
                            <FileCode2 className="w-3.5 h-3.5 text-[#4cd7f6] shrink-0" />
                            <span className="truncate">{file.path}</span>
                          </button>
                          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingFilePath(file.path);
                                setRenameFileDraft(file.path);
                              }}
                              aria-label={`Rename ${file.path}`}
                              className="p-0.5 text-[#958ea0] hover:text-[#e4e1e9] cursor-pointer"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            {project.files.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteFile(file.path)}
                                aria-label={`Delete ${file.path}`}
                                className="p-0.5 text-[#958ea0] hover:text-[#ffb4ab] cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {leftTab === 'versions' && (
            <div className="flex-1 flex flex-col min-h-0 p-2.5 space-y-2.5 overflow-y-auto">
              <form onSubmit={handleCreateCheckpoint} className="flex gap-1.5">
                <input
                  value={checkpointLabel}
                  onChange={(e) => setCheckpointLabel(e.target.value)}
                  placeholder="Checkpoint label..."
                  className="flex-1 min-w-0 bg-[#0a0a0f] border border-white/[0.1] rounded px-2 py-1 text-[11px] text-[#e4e1e9]"
                />
                <button
                  type="submit"
                  className="btn-synthetic px-2.5 py-1 rounded text-[11px] text-white cursor-pointer shrink-0"
                >
                  Save
                </button>
              </form>

              <div className="space-y-1.5">
                {(project.versions || []).length === 0 ? (
                  <p className="text-[11px] text-[#958ea0]">
                    Checkpoints are created automatically before AI edits or manually above.
                  </p>
                ) : (
                  (project.versions || []).map((ver) => (
                    <div
                      key={ver.id}
                      className="p-2 rounded-lg bg-[#0a0a0f]/80 border border-white/[0.06] space-y-1.5 text-[11px]"
                    >
                      <div className="font-medium text-[#e4e1e9] truncate">{ver.label}</div>
                      <div className="text-[#958ea0] text-[10.5px]">
                        {ver.filesSnapshot.length} files · {new Date(ver.createdAt).toLocaleTimeString()}
                      </div>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleInspectDiff(ver)}
                          className="btn-kinetic flex-1 py-1 rounded inline-flex items-center justify-center gap-1 cursor-pointer"
                        >
                          <GitCompare className="w-3 h-3" />
                          <span>Diff</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRestoreVersion(ver.id)}
                          className="btn-kinetic flex-1 py-1 rounded inline-flex items-center justify-center gap-1 text-[#4cd7f6] cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {leftTab === 'github' && (
            <GitHubPanel
              project={project}
              onProjectUpdated={onProjectUpdated}
              onOpenSettings={onOpenSettings}
            />
          )}
        </aside>

        {/* Center: Code Editor + Bottom Multi-Tool Dock */}
        <div className="flex-1 flex flex-col min-w-0 min-h-[480px] lg:min-h-0 border-b lg:border-b-0 lg:border-r border-white/[0.06]">
          <div className="h-10 px-4 bg-[#131318] border-b border-white/[0.06] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Code2 className="w-3.5 h-3.5 text-[#d0bcff] shrink-0" />
              <span className="font-mono text-xs text-[#e4e1e9] truncate">{activeFilePath}</span>
              {isDirty && <span className="text-[11px] text-[#4cd7f6]">Unsaved</span>}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleGenerateDocs}
                className="btn-kinetic inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs text-[#cbc3d7] cursor-pointer"
              >
                <FileText className="w-3 h-3" />
                <span className="hidden sm:inline">Generate Docs</span>
              </button>
              <button
                type="button"
                onClick={handleSaveCurrentFile}
                disabled={isSaving}
                className="btn-kinetic inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-[#e4e1e9] cursor-pointer disabled:opacity-45"
              >
                <Save className="w-3 h-3" />
                <span>{isSaving ? 'Saving...' : 'Save Project'}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-[220px] flex overflow-auto bg-[#0a0a0f]">
            <div
              aria-hidden="true"
              className="py-3 px-3 text-right font-mono text-xs leading-[1.4rem] text-[#958ea0]/45 select-none border-r border-white/[0.05] tabular-nums"
            >
              {Array.from({ length: lineCount }).map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>
            <textarea
              aria-label={`Code editor for ${activeFilePath}`}
              value={editorContent}
              onChange={(e) => {
                setEditorContent(e.target.value);
                setIsDirty(true);
              }}
              onBlur={() => {
                if (autoSaveOnBlur && isDirty && activeFilePath) {
                  void handleSaveCurrentFile();
                }
              }}
              style={{ tabSize: editorTabSize }}
              spellCheck={false}
              className={`flex-1 w-full bg-transparent ${
                compactDensity ? 'p-2' : 'p-3'
              } font-mono text-[12.5px] leading-[1.4rem] text-[#e4e1e9] focus:outline-none resize-none`}
            />
          </div>

          {/* Bottom Console / Diagnostics / Backend Server / AI Fixer / Testing Center */}
          <div className="h-56 glass-layer-1 border-t border-white/[0.08] flex flex-col shrink-0">
            <div className="px-3 h-9 border-b border-white/[0.06] flex items-center justify-between gap-2 overflow-x-auto">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setBottomTab('console')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                    bottomTab === 'console'
                      ? 'bg-[#8b5cf6]/20 text-[#e4e1e9]'
                      : 'text-[#958ea0] hover:text-[#e4e1e9]'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Console</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('diagnostics')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                    bottomTab === 'diagnostics'
                      ? 'bg-[#8b5cf6]/20 text-[#e4e1e9]'
                      : 'text-[#958ea0] hover:text-[#e4e1e9]'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Diagnostics ({errorCount}/{warningCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('server')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                    bottomTab === 'server'
                      ? 'bg-[#8b5cf6]/20 text-[#e4e1e9]'
                      : 'text-[#958ea0] hover:text-[#e4e1e9]'
                  }`}
                >
                  <Server className="w-3.5 h-3.5" />
                  <span>Backend Server</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('fixer')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                    bottomTab === 'fixer'
                      ? 'bg-[#8b5cf6]/20 text-[#e4e1e9]'
                      : 'text-[#958ea0] hover:text-[#e4e1e9]'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>AI Error Fixer</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBottomTab('tests')}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap cursor-pointer ${
                    bottomTab === 'tests'
                      ? 'bg-[#8b5cf6]/20 text-[#e4e1e9]'
                      : 'text-[#958ea0] hover:text-[#e4e1e9]'
                  }`}
                >
                  <FlaskConical className="w-3.5 h-3.5" />
                  <span>Testing Center</span>
                </button>
              </div>
              <span className="font-mono text-[11px] text-[#958ea0] hidden md:inline shrink-0">
                Build: {project.build.status}
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 font-mono text-xs space-y-1.5">
              {bottomTab === 'console' && (
                <>
                  {project.build.logs.map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.includes('[ERROR]') || line.includes('halted') || line.includes('failed')
                          ? 'text-[#ffb4ab]'
                          : line.includes('[WARNING]')
                          ? 'text-[#d0bcff]'
                          : 'text-[#cbc3d7]'
                      }
                    >
                      {line}
                    </div>
                  ))}
                  {project.build.status === 'toolchain_unavailable' && (
                    <div className="mt-2 p-2.5 rounded bg-[#131318] border border-[#d0bcff]/30 text-[#cbc3d7] flex flex-wrap items-center justify-between gap-2">
                      <span>
                        Android Build Service:{' '}
                        <strong className="text-[#e4e1e9]">
                          {project.build.toolchain.remoteRunner ? 'Configured' : 'Not Configured'}
                        </strong>{' '}
                        (optional). Source generation, validation, Compose UI preview, and Source ZIP
                        export remain active.
                      </span>
                      {onOpenSettings && (
                        <button
                          type="button"
                          onClick={onOpenSettings}
                          className="text-[#4cd7f6] hover:underline cursor-pointer shrink-0"
                        >
                          View Setup in Settings →
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}

              {bottomTab === 'diagnostics' && (
                <div className="space-y-1.5">
                  <div className="text-[11px] text-[#958ea0]">
                    Android Build Service:{' '}
                    {project.build.toolchain.remoteRunner ? 'Configured' : 'Not Configured'} · JDK=
                    {project.build.toolchain.java ? 'yes' : 'missing'} · Gradle=
                    {project.build.toolchain.gradle ? 'yes' : 'missing'} · AndroidSDK=
                    {project.build.toolchain.androidSdk ? 'yes' : 'missing'}
                  </div>
                  {project.build.diagnostics.map((d, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectFile(d.file)}
                      className="w-full text-left flex items-start gap-2 px-2.5 py-1.5 rounded bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer"
                    >
                      <span
                        className={
                          d.severity === 'error'
                            ? 'text-[#ffb4ab]'
                            : d.severity === 'warning'
                            ? 'text-[#d0bcff]'
                            : 'text-[#4cd7f6]'
                        }
                      >
                        [{d.severity.toUpperCase()}]
                      </span>
                      <span className="text-[#e4e1e9] shrink-0">{d.file}</span>
                      <span className="text-[#cbc3d7]">{d.message}</span>
                    </button>
                  ))}
                </div>
              )}

              {bottomTab === 'server' && (
                <div className="space-y-2 font-sans">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-[#cbc3d7] font-mono">
                      Status: <span className="text-[#4cd7f6]">{runtime?.status || 'stopped'}</span>
                      {runtime?.port ? ` · Port ${runtime.port}` : ''}
                      {runtime?.pid ? ` · PID ${runtime.pid}` : ''}
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={runtimeBusy}
                        onClick={handleStartServer}
                        className="btn-synthetic px-2.5 py-1 rounded text-xs text-white cursor-pointer"
                      >
                        {runtime?.status === 'running' ? 'Restart Server' : 'Start Server'}
                      </button>
                      {runtime?.status === 'running' && (
                        <button
                          type="button"
                          disabled={runtimeBusy}
                          onClick={handleStopServer}
                          className="btn-kinetic px-2.5 py-1 rounded text-xs text-[#ffb4ab] cursor-pointer"
                        >
                          Stop
                        </button>
                      )}
                    </div>
                  </div>
                  {runtime?.lastError && (
                    <div className="p-2 rounded bg-[#93000a]/25 text-[#ffdad6] font-mono text-[11px]">
                      {runtime.lastError}
                    </div>
                  )}
                  <div className="font-mono text-[11px] space-y-0.5 text-[#cbc3d7]">
                    {(runtime?.logs || []).map((l, idx) => (
                      <div key={idx}>{l}</div>
                    ))}
                    {(!runtime || runtime.logs.length === 0) && (
                      <div className="text-[#958ea0]">
                        Click Start Server to launch this workspace in an isolated child process.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {bottomTab === 'fixer' && (
                <div className="space-y-2.5 font-sans">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[#cbc3d7]">
                      Inspects real diagnostics, test failures, and server errors before proposing edits.
                    </span>
                    <button
                      type="button"
                      disabled={fixingBusy}
                      onClick={handleDiagnoseErrors}
                      className="btn-synthetic inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs text-white cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-3 h-3" />
                      <span>{fixingBusy ? 'Analyzing...' : 'Diagnose Errors'}</span>
                    </button>
                  </div>
                  {fixError && (
                    <div className="p-2 rounded bg-[#93000a]/25 text-[#ffdad6] text-xs">{fixError}</div>
                  )}
                  {fixProposal && (
                    <div className="p-3 rounded-lg bg-[#131318] border border-[#06b6d4]/40 space-y-2 text-xs">
                      <div className="font-semibold text-[#e4e1e9]">{fixProposal.summary}</div>
                      <div className="text-[#958ea0]">Root cause: {fixProposal.rootCause}</div>
                      {fixProposal.affectedFiles.length > 0 && (
                        <div className="font-mono text-[11px] text-[#4cd7f6]">
                          Affected: {fixProposal.affectedFiles.join(', ')}
                        </div>
                      )}
                      {fixProposal.proposedFiles.length > 0 && (
                        <button
                          type="button"
                          disabled={fixingBusy}
                          onClick={handleApplyFix}
                          className="btn-synthetic px-3 py-1.5 rounded text-xs text-white cursor-pointer"
                        >
                          Approve, Apply Fix &amp; Re-Verify Tests
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {bottomTab === 'tests' && (
                <div className="space-y-2 font-sans">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[#cbc3d7]">
                      {latestTestRun
                        ? `Last Run: ${latestTestRun.passedCount}/${latestTestRun.total} passed (${latestTestRun.durationMs}ms)`
                        : 'No verification suite executed yet.'}
                    </span>
                    <button
                      type="button"
                      disabled={testingBusy}
                      onClick={handleRunTests}
                      className="btn-synthetic inline-flex items-center gap-1.5 px-3 py-1 rounded text-xs text-white cursor-pointer"
                    >
                      <FlaskConical className="w-3 h-3" />
                      <span>{testingBusy ? 'Running...' : 'Run Tests'}</span>
                    </button>
                  </div>
                  {latestTestRun && (
                    <div className="space-y-1 font-mono text-[11px]">
                      {latestTestRun.cases.map((tc) => (
                        <div
                          key={tc.id}
                          className="flex items-start justify-between gap-2 p-1.5 rounded bg-white/[0.03]"
                        >
                          <div className="flex items-start gap-1.5">
                            {tc.passed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-[#4cd7f6] shrink-0 mt-0.5" />
                            ) : (
                              <AlertCircle className="w-3.5 h-3.5 text-[#ffb4ab] shrink-0 mt-0.5" />
                            )}
                            <div>
                              <span className="text-[#e4e1e9]">{tc.name}</span>
                              <div className="text-[#958ea0]">{tc.message}</div>
                            </div>
                          </div>
                          <span className="text-[#958ea0] shrink-0">{tc.durationMs}ms</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Preview Panel + AI Development Chat + Asset Studio */}
        <aside
          className={`${
            previewFullscreen
              ? 'fixed inset-0 z-50 w-full h-full'
              : 'w-full lg:w-[410px] xl:w-[440px]'
          } glass-layer-1 flex flex-col shrink-0`}
        >
          <div className="h-10 px-3 border-b border-white/[0.06] flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRightTab('preview')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                  rightTab === 'preview'
                    ? 'bg-[#8b5cf6]/25 text-[#e4e1e9]'
                    : 'text-[#958ea0] hover:text-[#e4e1e9]'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Preview</span>
              </button>
              <button
                type="button"
                onClick={() => setRightTab('chat')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                  rightTab === 'chat'
                    ? 'bg-[#8b5cf6]/25 text-[#e4e1e9]'
                    : 'text-[#958ea0] hover:text-[#e4e1e9]'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>AI Chat</span>
              </button>
              <button
                type="button"
                onClick={() => setRightTab('assets')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                  rightTab === 'assets'
                    ? 'bg-[#06b6d4]/20 text-[#4cd7f6]'
                    : 'text-[#958ea0] hover:text-[#e4e1e9]'
                }`}
              >
                <span>Assets ({unapprovedAssets.length})</span>
              </button>
            </div>

            {rightTab === 'preview' && (
              <div className="flex items-center gap-1">
                {project.type === 'website' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setViewportMode('desktop')}
                      aria-label="Desktop viewport"
                      className={`p-1 rounded cursor-pointer ${
                        viewportMode === 'desktop' ? 'text-[#4cd7f6]' : 'text-[#958ea0]'
                      }`}
                    >
                      <Monitor className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewportMode('tablet')}
                      aria-label="Tablet viewport"
                      className={`p-1 rounded cursor-pointer ${
                        viewportMode === 'tablet' ? 'text-[#4cd7f6]' : 'text-[#958ea0]'
                      }`}
                    >
                      <Tablet className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewportMode('mobile')}
                      aria-label="Mobile viewport"
                      className={`p-1 rounded cursor-pointer ${
                        viewportMode === 'mobile' ? 'text-[#4cd7f6]' : 'text-[#958ea0]'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewFullscreen((p) => !p)}
                  aria-label="Toggle fullscreen preview"
                  className="p-1 rounded text-[#958ea0] hover:text-[#e4e1e9] cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewKey((k) => k + 1)}
                  aria-label="Reload preview"
                  className="p-1 rounded text-[#958ea0] hover:text-[#e4e1e9] cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {rightTab === 'preview' && (
            <div className="flex-1 p-3 flex flex-col items-center justify-center bg-[#09090d] overflow-auto gap-2">
              {project.type === 'android-apk' && (
                <div className="text-[10.5px] font-mono text-[#d0bcff] bg-[#8b5cf6]/10 border border-[#8b5cf6]/30 px-2.5 py-1 rounded">
                  Android Compose UI Simulation · Export ZIP to build native APK
                </div>
              )}
              {useLiveRuntimeProxy && (
                <div className="text-[10.5px] font-mono text-[#4cd7f6] bg-[#06b6d4]/10 border border-[#06b6d4]/30 px-2.5 py-1 rounded">
                  Live Isolated Node Server · Port {runtime?.port}
                </div>
              )}
              <div
                style={{
                  maxWidth:
                    project.type === 'android-apk'
                      ? '320px'
                      : viewportMode === 'mobile'
                      ? '375px'
                      : viewportMode === 'tablet'
                      ? '768px'
                      : '100%',
                }}
                className={`w-full overflow-hidden border border-white/[0.12] bg-[#0a0a0f] shadow-[0_18px_48px_rgba(0,0,0,0.75)] ${
                  project.type === 'android-apk'
                    ? 'h-[540px] rounded-[28px]'
                    : previewFullscreen
                    ? 'flex-1 h-full rounded-xl'
                    : 'h-[490px] rounded-xl'
                }`}
              >
                {useLiveRuntimeProxy ? (
                  <iframe
                    key={`proxy-${previewKey}`}
                    title={`${project.name} Live Isolated Preview`}
                    src={`${runtime!.previewUrl}?k=${previewKey}`}
                    className="w-full h-full border-0 bg-[#0a0a0f]"
                  />
                ) : (
                  <iframe
                    key={`srcdoc-${previewKey}`}
                    title={`${project.name} Interactive Preview`}
                    sandbox="allow-scripts"
                    srcDoc={project.previewHtml}
                    className="w-full h-full border-0 bg-[#0a0a0f]"
                  />
                )}
              </div>
            </div>
          )}

          {rightTab === 'assets' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-[#958ea0]">
                  Assets require explicit approval before entering source files.
                </span>
                <input
                  ref={assetUploadRef}
                  type="file"
                  accept="image/*,audio/*,.svg,.json,.woff,.woff2,.ttf"
                  onChange={handleAssetUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => assetUploadRef.current?.click()}
                  className="btn-kinetic inline-flex items-center gap-1 px-2.5 py-1.5 rounded text-xs text-[#4cd7f6] cursor-pointer shrink-0"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload</span>
                </button>
              </div>

              {project.pendingAssets.length === 0 && (
                <div className="p-6 rounded-xl bg-[#0a0a0f]/75 border border-white/[0.06] text-center text-xs text-[#958ea0]">
                  No pending or uploaded assets yet. Upload custom sprites, icons, audio, fonts, or JSON scenes above.
                </div>
              )}

              {project.pendingAssets.map((asset) => (
                <div
                  key={asset.id}
                  className="glass-layer-2 rounded-xl p-3.5 space-y-2.5 border border-white/[0.08]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display text-xs font-semibold text-[#e4e1e9] truncate">
                        {asset.name}
                      </div>
                      <div className="font-mono text-[10.5px] text-[#958ea0] truncate">
                        {asset.targetPath}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAsset(asset.id)}
                      aria-label={`Remove ${asset.name}`}
                      className="text-[#958ea0] hover:text-[#ffb4ab] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {asset.svgMarkup ? (
                    <div
                      className="h-24 rounded-lg bg-[#0a0a0f] border border-white/[0.06] flex items-center justify-center p-2 overflow-hidden"
                      dangerouslySetInnerHTML={{ __html: asset.svgMarkup }}
                    />
                  ) : asset.dataUrl && asset.mimeType?.startsWith('image/') ? (
                    <div className="h-24 rounded-lg bg-[#0a0a0f] border border-white/[0.06] flex items-center justify-center p-2">
                      <img src={asset.dataUrl} alt={asset.name} className="max-h-full object-contain" />
                    </div>
                  ) : (
                    <div className="p-2 rounded bg-[#0a0a0f] font-mono text-[11px] text-[#958ea0]">
                      {asset.kind} · {asset.sizeBytes ? `${Math.round(asset.sizeBytes / 1024)} KB` : 'asset'}
                    </div>
                  )}

                  <button
                    type="button"
                    disabled={asset.approved}
                    onClick={() => onApproveAsset(project.id, asset.id)}
                    className={`w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium ${
                      asset.approved
                        ? 'bg-[#06b6d4]/15 text-[#4cd7f6] border border-[#06b6d4]/40 cursor-default'
                        : 'btn-synthetic text-white cursor-pointer'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{asset.approved ? 'Added to Project' : 'Approve & Add to Source'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {rightTab === 'chat' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {project.chat.map((msg) => (
                  <div
                    key={msg.id}
                    className={`rounded-xl p-3 text-xs space-y-1.5 ${
                      msg.role === 'user'
                        ? 'bg-[#8b5cf6]/18 border border-[#8b5cf6]/40 ml-6 text-[#e4e1e9]'
                        : 'bg-[#131318] border border-white/[0.07] mr-4 text-[#cbc3d7]'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[11px] text-[#958ea0]">
                      <span className="font-display font-medium text-[#e4e1e9]">
                        {msg.role === 'user' ? 'You' : 'Nexora AI'}
                      </span>
                      {msg.modelUsed && <span className="font-mono">{msg.modelUsed}</span>}
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                    {msg.modifiedFiles && msg.modifiedFiles.length > 0 && (
                      <div className="pt-1 font-mono text-[11px] text-[#4cd7f6]">
                        Files: {msg.modifiedFiles.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {chatError && (
                <div className="mx-4 mb-2 px-3 py-2.5 rounded-md bg-[#93000a]/25 border border-[#ffb4ab]/35 text-xs text-[#ffdad6] space-y-1.5">
                  <div>{chatError.message}</div>
                  {chatError.fallbacks && chatError.fallbacks.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {chatError.fallbacks.map((alt) => (
                        <button
                          key={alt.modelId}
                          type="button"
                          onClick={() => {
                            setWorkspaceModelId(alt.modelId);
                            setWorkspaceSmartRoute(false);
                            setChatError(null);
                          }}
                          className="px-2 py-0.5 rounded bg-[#06b6d4]/20 border border-[#06b6d4]/45 text-[#4cd7f6] cursor-pointer"
                        >
                          Use {alt.providerName} · {alt.modelName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <form
                onSubmit={handleChatSubmit}
                className="p-3 border-t border-white/[0.06] flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask AI to edit files, add API routes, or fix bugs..."
                  aria-label="AI development chat message"
                  className="flex-1 bg-[#0a0a0f]/85 border border-white/[0.1] focus:border-[#06b6d4] rounded-md px-3 py-2 text-xs text-[#e4e1e9] placeholder:text-[#958ea0] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isChatting || !chatInput.trim()}
                  className="btn-synthetic p-2 rounded-md text-white cursor-pointer disabled:opacity-50"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          )}
        </aside>
      </div>

      {/* Environment Variables Modal */}
      {envModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="glass-layer-3 spectral-top-edge w-full max-w-lg rounded-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
                Project Environment Variables (.env)
              </h2>
              <button
                type="button"
                onClick={() => setEnvModalOpen(false)}
                className="text-[#958ea0] hover:text-[#e4e1e9] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[#958ea0]">
              Injected strictly into this workspace&apos;s isolated Node runner (parent host secrets
              remain isolated).
            </p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {envDraft.map((item, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <input
                    value={item.key}
                    onChange={(e) =>
                      setEnvDraft((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, key: e.target.value } : row))
                      )
                    }
                    placeholder="KEY_NAME"
                    className="w-40 bg-[#0a0a0f] border border-white/[0.1] rounded px-2.5 py-1.5 font-mono text-[#e4e1e9]"
                  />
                  <input
                    value={item.value}
                    onChange={(e) =>
                      setEnvDraft((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row))
                      )
                    }
                    placeholder="value"
                    className="flex-1 bg-[#0a0a0f] border border-white/[0.1] rounded px-2.5 py-1.5 font-mono text-[#e4e1e9]"
                  />
                  <button
                    type="button"
                    onClick={() => setEnvDraft((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-[#958ea0] hover:text-[#ffb4ab] cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setEnvDraft((prev) => [...prev, { key: '', value: '' }])}
              className="btn-kinetic inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs text-[#4cd7f6] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Variable</span>
            </button>
            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setEnvModalOpen(false)}
                className="btn-kinetic px-4 py-2 rounded text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEnvVars}
                className="btn-synthetic px-4 py-2 rounded text-xs text-white cursor-pointer"
              >
                Save Variables
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Version Diff & Restore Modal */}
      {diffModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="glass-layer-3 spectral-top-edge w-full max-w-2xl rounded-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
                Compare Snapshot: {diffModal.version.label}
              </h2>
              <button
                type="button"
                onClick={() => setDiffModal(null)}
                className="text-[#958ea0] hover:text-[#e4e1e9] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2">
              {diffModal.diffs
                .filter((d) => d.status !== 'unchanged')
                .map((d) => (
                  <div
                    key={d.path}
                    className="p-2.5 rounded-lg bg-[#0a0a0f]/80 border border-white/[0.08] font-mono text-[11px] space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[#e4e1e9]">{d.path}</span>
                      <span className="text-[#4cd7f6]">{d.status}</span>
                    </div>
                    {d.previewLines.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.type === '+'
                            ? 'text-[#4cd7f6]'
                            : line.type === '-'
                            ? 'text-[#ffb4ab]'
                            : 'text-[#958ea0]'
                        }
                      >
                        {line.type} {line.text}
                      </div>
                    ))}
                  </div>
                ))}
              {diffModal.diffs.every((d) => d.status === 'unchanged') && (
                <div className="text-[#958ea0] py-4 text-center">
                  No differences between the current workspace and this snapshot.
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setDiffModal(null)}
                className="btn-kinetic px-4 py-2 rounded text-xs cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => handleRestoreVersion(diffModal.version.id)}
                className="btn-synthetic px-4 py-2 rounded text-xs text-white cursor-pointer"
              >
                Restore This Snapshot
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Center Modal */}
      {exportCenterOpen && (
        <ExportCenterModal
          project={project}
          onClose={() => setExportCenterOpen(false)}
          onGenerateDocs={handleGenerateDocs}
        />
      )}
    </div>
  );
};
