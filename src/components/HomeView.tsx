import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Box,
  Check,
  Copy,
  Cpu,
  FolderOpen,
  Gamepad2,
  Globe,
  Paperclip,
  Pencil,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import {
  AIProviderConfig,
  FreeFallbackOption,
  NexoraProject,
  ProjectType,
  ReferenceAttachment,
} from '../types/nexora';
import { NexoraLogo } from './NexoraLogo';

interface HomeViewProps {
  providers: AIProviderConfig[];
  selectedModelId: string;
  onSelectModelId: (modelId: string) => void;
  smartRouting: boolean;
  onToggleSmartRouting: (next: boolean) => void;
  onStartCreating: (input: {
    prompt: string;
    type: ProjectType;
    gameGenre?: string;
    attachments: ReferenceAttachment[];
  }) => Promise<void>;
  isInitializing: boolean;
  creationError: {
    message: string;
    fallbacks?: FreeFallbackOption[];
  } | null;
  savedProjects: NexoraProject[];
  defaultProjectType?: ProjectType;
  onOpenProject: (project: NexoraProject) => void;
  onRenameProject: (projectId: string, name: string) => Promise<void>;
  onDuplicateProject: (projectId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onOpenModelHub: () => void;
  onViewAllProjects: () => void;
  onOpenTemplates?: () => void;
}

const PROJECT_TYPES: {
  id: ProjectType;
  label: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: 'android-apk',
    label: 'Android APK',
    subtitle: 'Kotlin & Jetpack Compose',
    icon: Smartphone,
  },
  {
    id: 'game-2d',
    label: '2D Game',
    subtitle: 'Canvas 2D & Android Host',
    icon: Gamepad2,
  },
  {
    id: 'game-3d',
    label: '3D Game',
    subtitle: '3D Engine & Android Host',
    icon: Box,
  },
  {
    id: 'website',
    label: 'Website',
    subtitle: 'Responsive HTML, CSS & JS',
    icon: Globe,
  },
];

const GAME_GENRES = [
  'Racing',
  'Cricket',
  'Adventure',
  'Simulation',
  'Custom Concept',
] as const;

const STARTER_PROMPTS: {
  label: string;
  type: ProjectType;
  genre?: string;
  prompt: string;
}[] = [
  {
    label: 'Dark Offline Music Player APK',
    type: 'android-apk',
    prompt:
      'Create a modern music player app with offline playback, playlists, equalizer bars, and a premium dark UI.',
  },
  {
    label: '2D Neon Drift Racing',
    type: 'game-2d',
    genre: 'Racing',
    prompt:
      'Build a top-down 2D drift racing game with lap timer, nitro boost, AI rival cars, and responsive touch controls.',
  },
  {
    label: '3D Arcade Cricket Blitz',
    type: 'game-3d',
    genre: 'Cricket',
    prompt:
      'Create a 3D stadium cricket batting game with bowler pitch variations, timing meter, sixes tracker, and scoreboard HUD.',
  },
  {
    label: 'Telemetry Studio Website',
    type: 'website',
    prompt:
      'Build a futuristic dark-glass product showcase and interactive API status dashboard for an aerospace robotics platform.',
  },
];

export const HomeView: React.FC<HomeViewProps> = ({
  providers,
  selectedModelId,
  onSelectModelId,
  smartRouting,
  onToggleSmartRouting,
  onStartCreating,
  isInitializing,
  creationError,
  savedProjects,
  defaultProjectType = 'android-apk',
  onOpenProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onOpenModelHub,
  onViewAllProjects,
  onOpenTemplates,
}) => {
  const [prompt, setPrompt] = useState('');
  const [projectType, setProjectType] = useState<ProjectType>(defaultProjectType);
  const [gameGenre, setGameGenre] = useState<string>('Racing');
  const [attachments, setAttachments] = useState<ReferenceAttachment[]>([]);
  const [projectFilter, setProjectFilter] = useState<'recent' | 'all' | 'unfinished'>('recent');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<NexoraProject | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setProjectType(defaultProjectType);
  }, [defaultProjectType]);

  const allFreeModels = useMemo(() => {
    return providers.flatMap((p) =>
      p.models
        .filter((m) => !m.categories.includes('image-gen'))
        .map((m) => ({
          ...m,
          providerName: p.name,
        }))
    );
  }, [providers]);

  const availableFreeModels = useMemo(
    () => allFreeModels.filter((m) => m.available),
    [allFreeModels]
  );

  const visibleProjects = useMemo(() => {
    if (projectFilter === 'unfinished') {
      return savedProjects.filter((p) => p.generationStatus !== 'completed');
    }
    if (projectFilter === 'recent') {
      return savedProjects.slice(0, 6);
    }
    return savedProjects;
  }, [savedProjects, projectFilter]);

  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const loaded: ReferenceAttachment[] = await Promise.all(
      files.slice(0, 5).map(
        (file) =>
          new Promise<ReferenceAttachment>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const raw = typeof reader.result === 'string' ? reader.result : '';
              resolve({
                name: file.name,
                mimeType: file.type || 'text/plain',
                size: file.size,
                contentPreview: raw.slice(0, 2000),
              });
            };
            reader.onerror = () => {
              resolve({
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                size: file.size,
                contentPreview: `[Reference file: ${file.name}]`,
              });
            };
            if (
              file.type.startsWith('text/') ||
              /\.(json|kt|xml|md|ts|tsx|js|css|html|gradle)$/i.test(file.name)
            ) {
              reader.readAsText(file);
            } else {
              resolve({
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                size: file.size,
                contentPreview: `[Attached reference asset: ${file.name} (${file.size} bytes)]`,
              });
            }
          })
      )
    );
    setAttachments((prev) => [...prev, ...loaded]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isInitializing) return;
    const trimmed = prompt.trim();
    if (!trimmed) {
      setValidationError('Please describe the app, game, or website you want to build before generating.');
      return;
    }
    if (trimmed.length < 3) {
      setValidationError('Prompt must be at least 3 characters long.');
      return;
    }
    setValidationError(null);
    await onStartCreating({
      prompt: trimmed,
      type: projectType,
      gameGenre: projectType === 'game-2d' || projectType === 'game-3d' ? gameGenre : undefined,
      attachments,
    });
  };

  const isGameType = projectType === 'game-2d' || projectType === 'game-3d';

  return (
    <div className="flex-1 overflow-y-auto studio-grid-bg">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-12">
        {/* Welcome Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2.5 text-xs text-[#4cd7f6] font-medium">
            <NexoraLogo variant="symbol" size="xs" />
            <span>Nexora Studio Platform</span>
            <span aria-hidden="true">·</span>
            <span className="text-[#958ea0]">Instant Workspace Generation</span>
          </div>

          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-[-0.03em] text-[#e4e1e9] max-w-3xl [text-wrap:balance]">
            Build Android apps, interactive games, and web systems from one prompt.
          </h1>

          <p className="text-sm sm:text-base text-[#cbc3d7] max-w-2xl leading-relaxed">
            Powered strictly by verified free-tier, open-source, and local AI models. Enter your
            idea and jump directly into a dedicated workspace while code generation runs live.
          </p>
        </section>

        {/* Creation Composer */}
        <form
          onSubmit={handleSubmit}
          className="glass-layer-2 spectral-top-edge rounded-2xl p-5 sm:p-6 space-y-6"
        >
          {/* Project Type Selector */}
          <div className="space-y-2.5">
            <label className="block font-display text-xs font-semibold tracking-[0.04em] text-[#cbc3d7]">
              Project Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PROJECT_TYPES.map((item) => {
                const Icon = item.icon;
                const active = projectType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setProjectType(item.id)}
                    className={`flex items-start gap-3 p-3.5 rounded-xl text-left transition-all cursor-pointer ${
                      active
                        ? 'bg-[#8b5cf6]/20 border border-[#8b5cf6]/60 shadow-[0_0_20px_-4px_rgba(139,92,246,0.35)]'
                        : 'bg-[#0a0a0f]/60 border border-white/[0.08] hover:border-white/[0.18]'
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        active ? 'bg-[#8b5cf6]/25 text-[#d0bcff]' : 'bg-white/[0.04] text-[#958ea0]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-sm font-semibold text-[#e4e1e9]">
                        {item.label}
                      </div>
                      <div className="text-xs text-[#958ea0] mt-0.5 truncate">{item.subtitle}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Game Genre Selector */}
          {isGameType && (
            <div className="space-y-2">
              <div className="font-display text-xs font-semibold tracking-[0.04em] text-[#cbc3d7]">
                Game Genre
              </div>
              <div className="flex flex-wrap gap-2">
                {GAME_GENRES.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => setGameGenre(genre)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      gameGenre === genre
                        ? 'bg-[#06b6d4]/20 text-[#4cd7f6] border border-[#06b6d4]/50'
                        : 'bg-[#0a0a0f]/70 text-[#958ea0] hover:text-[#e4e1e9] border border-white/[0.08]'
                    }`}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Large Prompt Box */}
          <div className="space-y-2">
            <textarea
              value={prompt}
              maxLength={4000}
              onChange={(e) => {
                setPrompt(e.target.value);
                if (validationError) setValidationError(null);
              }}
              rows={4}
              placeholder="Describe the app or game you want to create..."
              aria-label="Project prompt"
              className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] focus:border-[#06b6d4] rounded-xl p-4 text-sm sm:text-base text-[#e4e1e9] placeholder:text-[#958ea0] focus:outline-none focus:shadow-[0_0_18px_rgba(6,182,212,0.15)] resize-y"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[#958ea0]">Examples:</span>
                {STARTER_PROMPTS.map((starter) => (
                  <button
                    key={starter.label}
                    type="button"
                    onClick={() => {
                      setPrompt(starter.prompt);
                      setProjectType(starter.type);
                      if (starter.genre) setGameGenre(starter.genre);
                      setValidationError(null);
                    }}
                    className="px-2.5 py-1 rounded-md text-xs bg-white/[0.04] hover:bg-white/[0.08] text-[#cbc3d7] border border-white/[0.07] transition-colors cursor-pointer"
                  >
                    {starter.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3 shrink-0 ml-auto">
                <span className="font-mono text-[11px] text-[#958ea0] tabular-nums">
                  {prompt.length} / 4000 chars
                </span>
                {prompt.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt('');
                      setValidationError(null);
                    }}
                    className="text-xs text-[#cbc3d7] hover:text-[#ffb4ab] transition-colors cursor-pointer"
                  >
                    Clear prompt
                  </button>
                )}
              </div>
            </div>

            {validationError && (
              <div
                role="alert"
                className="rounded-lg border border-[#ffb4ab]/35 bg-[#93000a]/25 px-3 py-2 flex items-center gap-2 text-xs text-[#ffdad6]"
              >
                <AlertCircle className="w-4 h-4 shrink-0 text-[#ffb4ab]" />
                <span>{validationError}</span>
              </div>
            )}
          </div>

          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#1f1f25] border border-white/[0.08] text-xs text-[#e4e1e9]"
                >
                  <span className="font-mono truncate max-w-[180px]">{file.name}</span>
                  <span className="text-[#958ea0] tabular-nums">
                    {Math.max(1, Math.round(file.size / 1024))} KB
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-[#958ea0] hover:text-[#ffb4ab] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error + Free Alternative Switcher */}
          {creationError && (
            <div className="rounded-xl border border-[#ffb4ab]/35 bg-[#93000a]/25 p-4 space-y-2.5 text-xs text-[#ffdad6]">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#ffb4ab]" />
                <span>{creationError.message}</span>
              </div>
              {creationError.fallbacks && creationError.fallbacks.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[#cbc3d7]">Switch to an available free model:</span>
                  {creationError.fallbacks.map((alt) => (
                    <button
                      key={alt.modelId}
                      type="button"
                      onClick={() => {
                        onSelectModelId(alt.modelId);
                        onToggleSmartRouting(false);
                      }}
                      className="px-2.5 py-1 rounded-md bg-[#06b6d4]/20 border border-[#06b6d4]/50 text-[#4cd7f6] hover:brightness-110 cursor-pointer"
                    >
                      {alt.providerName} · {alt.modelName}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bottom Action Row */}
          <div className="pt-2 border-t border-white/[0.06] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onToggleSmartRouting(!smartRouting)}
                className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
                  smartRouting
                    ? 'bg-[#06b6d4]/15 border-[#06b6d4]/50 text-[#4cd7f6]'
                    : 'bg-[#0a0a0f]/75 border-white/[0.1] text-[#958ea0] hover:text-[#e4e1e9]'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                <span>Auto-Select Free Model: {smartRouting ? 'On' : 'Off'}</span>
              </button>

              <div className="flex items-center gap-2">
                <select
                  aria-label="Free AI model selector"
                  value={selectedModelId}
                  onChange={(e) => {
                    onSelectModelId(e.target.value);
                    if (smartRouting) onToggleSmartRouting(false);
                  }}
                  className="bg-[#0a0a0f]/90 border border-white/[0.1] focus:border-[#8b5cf6] rounded-md px-3 py-2 text-xs text-[#e4e1e9] focus:outline-none cursor-pointer max-w-[270px]"
                >
                  {availableFreeModels.length === 0 ? (
                    <option value="">No available free models detected</option>
                  ) : (
                    allFreeModels.map((m) => (
                      <option
                        key={m.id}
                        value={m.id}
                        disabled={!m.available}
                        className="bg-[#131318] text-[#e4e1e9]"
                      >
                        {m.providerName} · {m.name} {m.available ? '(Free)' : '(Unavailable)'}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="button"
                  onClick={onOpenModelHub}
                  className="text-xs text-[#d0bcff] hover:underline whitespace-nowrap cursor-pointer"
                >
                  Free Model Hub
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFilesSelected}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="btn-kinetic inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium text-[#cbc3d7] cursor-pointer"
              >
                <Paperclip className="w-3.5 h-3.5" />
                <span>Attach Reference Files</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={isInitializing}
              className="btn-synthetic inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md text-sm font-medium text-white whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <span>{isInitializing ? 'Opening Workspace...' : 'Start Creating'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Project Management: Recent & My Projects */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-[#e4e1e9]">
                My Projects &amp; Recent Work
              </h2>
              <p className="text-xs text-[#958ea0]">
                Continue previous work, rename, duplicate, or inspect saved workspaces.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 bg-[#131318] border border-white/[0.06] rounded-lg w-fit">
                {(
                  [
                    { id: 'recent', label: 'Recent Projects' },
                    { id: 'all', label: `All (${savedProjects.length})` },
                    { id: 'unfinished', label: 'Unfinished' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setProjectFilter(tab.id)}
                    className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                      projectFilter === tab.id
                        ? 'bg-[#8b5cf6]/25 text-[#e4e1e9]'
                        : 'text-[#958ea0] hover:text-[#e4e1e9]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {onOpenTemplates && (
                <button
                  type="button"
                  onClick={onOpenTemplates}
                  className="btn-kinetic px-3 py-1.5 rounded-md text-xs font-medium text-[#d0bcff] whitespace-nowrap cursor-pointer"
                >
                  Templates &amp; Import
                </button>
              )}
              <button
                type="button"
                onClick={onViewAllProjects}
                className="btn-kinetic px-3 py-1.5 rounded-md text-xs font-medium text-[#4cd7f6] whitespace-nowrap cursor-pointer"
              >
                Open My Projects
              </button>
            </div>
          </div>

          {visibleProjects.length === 0 ? (
            <div className="glass-layer-2 rounded-2xl p-8 text-center space-y-2">
              <p className="font-display text-sm font-medium text-[#e4e1e9]">
                No projects in this view
              </p>
              <p className="text-xs text-[#958ea0]">
                Enter a prompt above and click Start Creating to launch a dedicated workspace
                immediately.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleProjects.map((proj) => {
                const isRenaming = renamingId === proj.id;
                return (
                  <article
                    key={proj.id}
                    className="glass-layer-2 rounded-xl p-4 flex flex-col justify-between gap-4 hover:border-[#8b5cf6]/45 transition-colors"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        {isRenaming ? (
                          <div className="flex items-center gap-1.5 flex-1">
                            <input
                              value={renameDraft}
                              onChange={(e) => setRenameDraft(e.target.value)}
                              className="flex-1 bg-[#0a0a0f] border border-[#06b6d4] rounded px-2 py-1 text-xs text-[#e4e1e9]"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                if (renameDraft.trim()) {
                                  await onRenameProject(proj.id, renameDraft.trim());
                                }
                                setRenamingId(null);
                              }}
                              className="p-1 text-[#4cd7f6] cursor-pointer"
                              aria-label="Confirm rename"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingId(null)}
                              className="p-1 text-[#958ea0] cursor-pointer"
                              aria-label="Cancel rename"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <h3 className="font-display text-base font-semibold text-[#e4e1e9] truncate">
                            {proj.name}
                          </h3>
                        )}
                        <span className="text-xs font-mono text-[#4cd7f6] shrink-0">
                          {proj.type}
                        </span>
                      </div>
                      <p className="text-xs text-[#958ea0] line-clamp-2">{proj.prompt}</p>
                      <div className="text-[11px] font-mono text-[#cbc3d7]">
                        {proj.selectedProviderName} · Status: {proj.generationStatus}
                        {proj.generationStatus === 'generating'
                          ? ` (${proj.generationProgress}%)`
                          : ''}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <div className="text-xs text-[#958ea0] font-mono tabular-nums truncate">
                        {proj.files.length} files · {new Date(proj.updatedAt).toLocaleDateString()}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setRenamingId(proj.id);
                            setRenameDraft(proj.name);
                          }}
                          aria-label={`Rename ${proj.name}`}
                          className="p-1.5 rounded-md text-[#958ea0] hover:text-[#e4e1e9] hover:bg-white/[0.05] cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDuplicateProject(proj.id)}
                          aria-label={`Duplicate ${proj.name}`}
                          className="p-1.5 rounded-md text-[#958ea0] hover:text-[#4cd7f6] hover:bg-white/[0.05] cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(proj)}
                          aria-label={`Delete ${proj.name}`}
                          className="p-1.5 rounded-md text-[#958ea0] hover:text-[#ffb4ab] hover:bg-white/[0.05] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenProject(proj)}
                          className="btn-kinetic inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-[#e4e1e9] cursor-pointer ml-1"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          <span>Open Workspace</span>
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="home-delete-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div className="glass-layer-3 spectral-top-edge w-full max-w-md rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[#93000a]/30 text-[#ffb4ab] shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2
                  id="home-delete-title"
                  className="font-display text-base font-semibold text-[#e4e1e9]"
                >
                  Delete Project?
                </h2>
                <p className="text-xs text-[#cbc3d7] leading-relaxed">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-[#e4e1e9]">{confirmDelete.name}</span>?
                  This removes its stored metadata and workspace files.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="btn-kinetic px-4 py-2 rounded-md text-xs font-medium text-[#cbc3d7] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmDelete;
                  setConfirmDelete(null);
                  await onDeleteProject(target.id);
                }}
                className="px-4 py-2 rounded-md text-xs font-medium bg-[#93000a] text-[#ffdad6] hover:brightness-110 cursor-pointer"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
