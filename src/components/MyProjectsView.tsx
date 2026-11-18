import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Check,
  Copy,
  FolderOpen,
  Gamepad2,
  Globe,
  Pencil,
  Plus,
  Search,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { NexoraProject, ProjectType } from '../types/nexora';

interface MyProjectsViewProps {
  projects: NexoraProject[];
  onOpenProject: (project: NexoraProject) => void;
  onRenameProject: (projectId: string, name: string) => Promise<void>;
  onDuplicateProject: (projectId: string) => Promise<void>;
  onDeleteProject: (projectId: string) => Promise<void>;
  onCreateNew: () => void;
  onOpenTemplates?: () => void;
}

const TYPE_META: Record<
  ProjectType,
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  'android-apk': { label: 'Android APK', icon: Smartphone },
  'game-2d': { label: '2D Game', icon: Gamepad2 },
  'game-3d': { label: '3D Game', icon: Box },
  website: { label: 'Website', icon: Globe },
};

export const MyProjectsView: React.FC<MyProjectsViewProps> = ({
  projects,
  onOpenProject,
  onRenameProject,
  onDuplicateProject,
  onDeleteProject,
  onCreateNew,
  onOpenTemplates,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ProjectType>('all');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<NexoraProject | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matched = projects.filter((p) => {
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.prompt.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.selectedProviderName.toLowerCase().includes(q)
      );
    });

    return [...matched].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [projects, searchQuery, typeFilter, sortBy]);

  const handleConfirmDelete = async () => {
    if (!confirmDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await onDeleteProject(confirmDelete.id);
      setConfirmDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto studio-grid-bg p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.015em] text-[#e4e1e9]">
              My Projects
            </h1>
            <p className="mt-1 text-sm text-[#958ea0]">
              Manage saved Android APKs, 2D/3D games, and web workspaces. Reopen, rename, duplicate,
              or permanently remove projects.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenTemplates && (
              <button
                type="button"
                onClick={onOpenTemplates}
                className="btn-kinetic inline-flex items-center gap-2 px-3.5 py-2.5 rounded-md text-xs font-medium text-[#4cd7f6] whitespace-nowrap cursor-pointer"
              >
                <span>Templates &amp; Import ZIP</span>
              </button>
            )}
            <button
              type="button"
              onClick={onCreateNew}
              className="btn-synthetic inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-xs font-medium text-white whitespace-nowrap shrink-0 cursor-pointer w-fit"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Project</span>
            </button>
          </div>
        </div>

        {/* Search, Type Filter & Sort Bar */}
        <div className="glass-layer-2 rounded-xl p-3.5 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-[#958ea0] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search projects by name, prompt, model, or ID..."
              aria-label="Search projects"
              className="w-full bg-[#0a0a0f]/85 border border-white/[0.08] focus:border-[#06b6d4] rounded-md pl-9 pr-3 py-2 text-xs text-[#e4e1e9] placeholder:text-[#958ea0] focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 p-1 bg-[#0a0a0f]/75 border border-white/[0.06] rounded-lg">
              {(
                [
                  { id: 'all', label: 'All Types' },
                  { id: 'android-apk', label: 'Android APK' },
                  { id: 'game-2d', label: '2D Game' },
                  { id: 'game-3d', label: '3D Game' },
                  { id: 'website', label: 'Website' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTypeFilter(item.id)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer ${
                    typeFilter === item.id
                      ? 'bg-[#8b5cf6]/25 text-[#e4e1e9]'
                      : 'text-[#958ea0] hover:text-[#e4e1e9]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Sort projects"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'updated' | 'created' | 'name')}
              className="bg-[#0a0a0f]/90 border border-white/[0.1] rounded-md px-3 py-2 text-xs text-[#e4e1e9] focus:outline-none focus:border-[#8b5cf6] cursor-pointer"
            >
              <option value="updated">Sort: Recently Updated</option>
              <option value="created">Sort: Newest Created</option>
              <option value="name">Sort: Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Projects List */}
        {filteredProjects.length === 0 ? (
          <div className="glass-layer-2 rounded-2xl p-10 text-center space-y-3">
            <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
              {projects.length === 0 ? 'No saved projects yet' : 'No matching projects found'}
            </h2>
            <p className="text-xs text-[#958ea0] max-w-md mx-auto">
              {projects.length === 0
                ? 'Start on the Home page to describe an Android app, game, or website and initialize your first workspace.'
                : 'Try clearing the search query or switching the project type filter.'}
            </p>
            {projects.length === 0 && (
              <button
                type="button"
                onClick={onCreateNew}
                className="btn-synthetic inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium text-white cursor-pointer mt-2"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Start New Project</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProjects.map((proj) => {
              const isRenaming = renamingId === proj.id;
              const typeInfo = TYPE_META[proj.type];
              const TypeIcon = typeInfo.icon;

              return (
                <article
                  key={proj.id}
                  className="glass-layer-2 rounded-xl p-5 flex flex-col justify-between gap-4 border border-white/[0.08] hover:border-[#8b5cf6]/45 transition-colors"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      {isRenaming ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            aria-label="New project name"
                            className="flex-1 bg-[#0a0a0f] border border-[#06b6d4] rounded px-2.5 py-1 text-xs text-[#e4e1e9]"
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
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            className="p-1 text-[#958ea0] cursor-pointer"
                            aria-label="Cancel rename"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-lg bg-[#8b5cf6]/15 text-[#d0bcff] shrink-0">
                            <TypeIcon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <h2 className="font-display text-base font-semibold text-[#e4e1e9] truncate">
                              {proj.name}
                            </h2>
                            <div className="font-mono text-[11px] text-[#958ea0] truncate">
                              ID: {proj.id}
                            </div>
                          </div>
                        </div>
                      )}

                      <span className="font-mono text-xs text-[#4cd7f6] shrink-0">
                        {typeInfo.label}
                      </span>
                    </div>

                    <p className="text-xs text-[#cbc3d7] line-clamp-2 leading-relaxed">
                      {proj.prompt}
                    </p>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono text-[#958ea0]">
                      <span>Model: {proj.selectedProviderName}</span>
                      <span>·</span>
                      <span
                        className={
                          proj.generationStatus === 'completed'
                            ? 'text-[#4cd7f6]'
                            : proj.generationStatus === 'error'
                            ? 'text-[#ffb4ab]'
                            : 'text-[#d0bcff]'
                        }
                      >
                        Status: {proj.generationStatus}
                      </span>
                      <span>·</span>
                      <span className="tabular-nums">
                        Created {new Date(proj.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                    <div className="text-xs text-[#958ea0] font-mono tabular-nums truncate">
                      {proj.files.length} files · Updated{' '}
                      {new Date(proj.updatedAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div className="glass-layer-3 spectral-top-edge w-full max-w-md rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-[#93000a]/30 text-[#ffb4ab] shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h2
                  id="delete-project-title"
                  className="font-display text-base font-semibold text-[#e4e1e9]"
                >
                  Delete Project?
                </h2>
                <p className="text-xs text-[#cbc3d7] leading-relaxed">
                  Are you sure you want to delete{' '}
                  <span className="font-semibold text-[#e4e1e9]">{confirmDelete.name}</span> (
                  <span className="font-mono">{confirmDelete.id}</span>)? This removes its stored
                  metadata and workspace files from disk.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={isDeleting}
                className="btn-kinetic px-4 py-2 rounded-md text-xs font-medium text-[#cbc3d7] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-md text-xs font-medium bg-[#93000a] text-[#ffdad6] hover:brightness-110 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
