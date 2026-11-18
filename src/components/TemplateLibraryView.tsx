import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Box,
  FileArchive,
  FolderGit2,
  Gamepad2,
  Globe,
  Layers,
  Loader2,
  Search,
  Server,
  Smartphone,
  Upload,
} from 'lucide-react';
import type {
  GitHubConnectionStatus,
  GitHubRepoInfo,
  NexoraProject,
  ProjectTemplate,
} from '../types/nexora';

interface TemplateLibraryViewProps {
  onProjectCreated: (project: NexoraProject) => void;
  onOpenSettings?: () => void;
}

export const TemplateLibraryView: React.FC<TemplateLibraryViewProps> = ({
  onProjectCreated,
  onOpenSettings,
}) => {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [search, setSearch] = useState('');

  const [selectedTemplate, setSelectedTemplate] = useState<ProjectTemplate | null>(null);
  const [customName, setCustomName] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [creatingId, setCreatingId] = useState<string | null>(null);

  // Import Project state (ZIP & GitHub)
  const [zipProjectName, setZipProjectName] = useState('');
  const [importingZip, setImportingZip] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);

  const [ghStatus, setGhStatus] = useState<GitHubConnectionStatus | null>(null);
  const [ghRepos, setGhRepos] = useState<GitHubRepoInfo[]>([]);
  const [importingRepo, setImportingRepo] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/templates').then((r) => r.json()),
      fetch('/api/github/status').then((r) => r.json()),
    ])
      .then(([tData, gData]) => {
        setTemplates((tData as { templates?: ProjectTemplate[] }).templates || []);
        const status = (gData as { status?: GitHubConnectionStatus }).status || null;
        setGhStatus(status);
        if (status?.connected) {
          fetch('/api/github/repos')
            .then((r) => r.json())
            .then((rd) => setGhRepos((rd as { repos?: GitHubRepoInfo[] }).repos || []))
            .catch(() => null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetch('/api/github/status')
          .then((r) => r.json())
          .then((gData) => {
            const st = (gData as { status?: GitHubConnectionStatus }).status || null;
            setGhStatus(st);
            if (st?.connected) {
              fetch('/api/github/repos')
                .then((r) => r.json())
                .then((rd) => setGhRepos((rd as { repos?: GitHubRepoInfo[] }).repos || []))
                .catch(() => null);
            }
          });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (categoryFilter !== 'All' && t.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.techStack.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [templates, categoryFilter, search]);

  const handleInstantiate = async (tpl: ProjectTemplate, name?: string, prompt?: string) => {
    setCreatingId(tpl.id);
    setImportError(null);
    try {
      const res = await fetch('/api/templates/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: tpl.id,
          customName: name?.trim() || undefined,
          customPrompt: prompt?.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { project?: NexoraProject; error?: string };
      if (!res.ok || !data.project) throw new Error(data.error || 'Failed to create from template');
      setSelectedTemplate(null);
      onProjectCreated(data.project);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingId(null);
    }
  };

  const handleZipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingZip(true);
    setImportError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read ZIP file.'));
        reader.readAsDataURL(file);
      });

      const res = await fetch('/api/projects/import/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zipBase64: base64,
          projectName: zipProjectName.trim() || file.name.replace(/\.zip$/i, ''),
        }),
      });
      const data = (await res.json()) as { project?: NexoraProject; error?: string };
      if (!res.ok || !data.project) throw new Error(data.error || 'ZIP import failed');
      onProjectCreated(data.project);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingZip(false);
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  };

  const handleGitHubOAuthPopup = async () => {
    setImportError(null);
    try {
      const res = await fetch('/api/github/auth/url');
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || 'GitHub OAuth unavailable');
      window.open(data.url, 'nexora_github_oauth', 'width=600,height=720');
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImportRepo = async (repo: GitHubRepoInfo) => {
    setImportingRepo(repo.fullName);
    setImportError(null);
    try {
      const res = await fetch('/api/github/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: repo.owner,
          repo: repo.name,
          branch: repo.defaultBranch,
        }),
      });
      const data = (await res.json()) as { project?: NexoraProject; error?: string };
      if (!res.ok || !data.project) throw new Error(data.error || 'GitHub import failed');
      onProjectCreated(data.project);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImportingRepo(null);
    }
  };

  const iconForCategory = (cat: ProjectTemplate['category']) => {
    switch (cat) {
      case 'Full-Stack Web':
        return Globe;
      case 'Backend API':
        return Server;
      case 'Android App':
        return Smartphone;
      case '2D Game':
        return Gamepad2;
      case '3D Game':
        return Box;
    }
  };

  return (
    <div className="flex-1 overflow-y-auto studio-grid-bg p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.015em] text-[#e4e1e9]">
            Templates &amp; Project Import
          </h1>
          <p className="mt-1 text-sm text-[#958ea0]">
            Launch immediately from full-stack, Android, or game starter templates, or safely import an
            existing ZIP archive or GitHub repository.
          </p>
        </div>

        {importError && (
          <div className="rounded-xl border border-[#ffb4ab]/35 bg-[#93000a]/25 p-3.5 text-xs text-[#ffdad6]">
            {importError}
          </div>
        )}

        {/* Import Existing Project Row */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass-layer-2 rounded-2xl p-5 space-y-3 border border-white/[0.08]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-[#06b6d4]/15 text-[#4cd7f6]">
                <FileArchive className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-display text-sm font-semibold text-[#e4e1e9]">
                  Import Project Archive (.zip)
                </h2>
                <p className="text-xs text-[#958ea0]">
                  Inspects framework &amp; dependencies safely without executing untrusted scripts.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={zipProjectName}
                onChange={(e) => setZipProjectName(e.target.value)}
                placeholder="Optional workspace name..."
                className="flex-1 min-w-[160px] bg-[#0a0a0f]/85 border border-white/[0.1] rounded-md px-3 py-2 text-xs text-[#e4e1e9] placeholder:text-[#958ea0]"
              />
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip"
                onChange={handleZipUpload}
                className="hidden"
              />
              <button
                type="button"
                disabled={importingZip}
                onClick={() => zipInputRef.current?.click()}
                className="btn-synthetic inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium text-white cursor-pointer disabled:opacity-50"
              >
                {importingZip ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Upload className="w-3.5 h-3.5" />
                )}
                <span>{importingZip ? 'Extracting...' : 'Upload ZIP'}</span>
              </button>
            </div>
          </div>

          <div className="glass-layer-2 rounded-2xl p-5 space-y-3 border border-white/[0.08]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#8b5cf6]/15 text-[#d0bcff]">
                  <FolderGit2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-display text-sm font-semibold text-[#e4e1e9]">
                      Import from GitHub
                    </h2>
                    <span
                      className={`px-1.5 py-0.5 rounded font-mono text-[10px] border ${
                        ghStatus?.connected
                          ? 'bg-[#06b6d4]/15 border-[#06b6d4]/40 text-[#4cd7f6]'
                          : 'bg-white/[0.04] border-white/[0.1] text-[#cbc3d7]'
                      }`}
                    >
                      {ghStatus?.connected ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  <p className="text-xs text-[#958ea0]">
                    {ghStatus?.connected
                      ? `Connected as @${ghStatus.user?.login}`
                      : 'Optional: sign in with GitHub OAuth once configured to clone repositories.'}
                  </p>
                </div>
              </div>

              {!ghStatus?.connected &&
                (ghStatus?.oauthConfigured ? (
                  <button
                    type="button"
                    onClick={handleGitHubOAuthPopup}
                    className="btn-kinetic px-3 py-1.5 rounded-md text-xs font-medium text-[#4cd7f6] cursor-pointer"
                  >
                    Connect GitHub
                  </button>
                ) : (
                  onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="btn-kinetic px-3 py-1.5 rounded-md text-xs font-medium text-[#cbc3d7] cursor-pointer shrink-0"
                    >
                      Setup in Settings
                    </button>
                  )
                ))}
            </div>

            {ghStatus?.connected ? (
              <div className="max-h-32 overflow-y-auto space-y-1.5">
                {ghRepos.slice(0, 6).map((repo) => (
                  <div
                    key={repo.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-[#0a0a0f]/75 border border-white/[0.06] text-xs"
                  >
                    <span className="font-mono text-[#e4e1e9] truncate">{repo.fullName}</span>
                    <button
                      type="button"
                      disabled={importingRepo === repo.fullName}
                      onClick={() => handleImportRepo(repo)}
                      className="text-[#4cd7f6] hover:underline shrink-0 cursor-pointer"
                    >
                      {importingRepo === repo.fullName ? 'Importing...' : 'Import'}
                    </button>
                  </div>
                ))}
                {ghRepos.length === 0 && (
                  <p className="text-xs text-[#958ea0]">No repositories found in your account.</p>
                )}
              </div>
            ) : (
              <div className="text-[11px] text-[#958ea0] font-mono bg-[#0a0a0f]/75 rounded-md p-2.5 border border-white/[0.05]">
                {ghStatus?.oauthConfigured
                  ? 'GitHub integration: Not Connected — click Connect GitHub to authorize.'
                  : 'GitHub integration: Not Connected (Optional — ZIP import & starter templates work without GitHub OAuth).'}
              </div>
            )}
          </div>
        </section>

        {/* Template Filter Bar */}
        <section className="space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {['All', 'Full-Stack Web', 'Backend API', 'Android App', '2D Game', '3D Game'].map(
                (cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer ${
                      categoryFilter === cat
                        ? 'bg-[#8b5cf6]/25 text-[#e4e1e9] border border-[#8b5cf6]/45'
                        : 'bg-[#131318] text-[#958ea0] hover:text-[#e4e1e9] border border-white/[0.06]'
                    }`}
                  >
                    {cat}
                  </button>
                )
              )}
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 text-[#958ea0] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates or stack..."
                className="w-full bg-[#0a0a0f]/85 border border-white/[0.1] rounded-md pl-8 pr-3 py-1.5 text-xs text-[#e4e1e9]"
              />
            </div>
          </div>

          {loading ? (
            <div className="glass-layer-2 rounded-2xl p-10 text-center text-xs text-[#958ea0]">
              Loading starter templates...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((tpl) => {
                const Icon = iconForCategory(tpl.category);
                return (
                  <article
                    key={tpl.id}
                    className="glass-layer-2 rounded-xl p-5 flex flex-col justify-between gap-4 border border-white/[0.08] hover:border-[#8b5cf6]/45 transition-colors"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-lg bg-[#8b5cf6]/15 text-[#d0bcff]">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="font-display text-base font-semibold text-[#e4e1e9]">
                              {tpl.name}
                            </h3>
                            <span className="text-[11px] font-mono text-[#4cd7f6]">
                              {tpl.category} · {tpl.files.length} files
                            </span>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-[#cbc3d7] leading-relaxed">{tpl.description}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {tpl.techStack.map((tech) => (
                          <span
                            key={tech}
                            className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] font-mono text-[10.5px] text-[#958ea0]"
                          >
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedTemplate(tpl);
                          setCustomName(tpl.name);
                          setCustomPrompt(tpl.defaultPrompt);
                        }}
                        className="btn-kinetic px-3 py-1.5 rounded-md text-xs text-[#cbc3d7] cursor-pointer"
                      >
                        Customize &amp; Preview
                      </button>
                      <button
                        type="button"
                        disabled={creatingId === tpl.id}
                        onClick={() => handleInstantiate(tpl)}
                        className="btn-synthetic inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-medium text-white cursor-pointer disabled:opacity-50"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>{creatingId === tpl.id ? 'Creating...' : 'Use Template'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Customize & Preview Modal */}
      {selectedTemplate && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="glass-layer-3 spectral-top-edge w-full max-w-2xl rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-[#e4e1e9]">
                Create from Template: {selectedTemplate.name}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="text-xs text-[#958ea0] hover:text-[#e4e1e9] cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="h-52 rounded-xl overflow-hidden border border-white/[0.1] bg-[#0a0a0f]">
              <iframe
                title={selectedTemplate.name}
                sandbox="allow-scripts"
                srcDoc={selectedTemplate.previewHtml}
                className="w-full h-full border-0"
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#cbc3d7] mb-1">Project Name</label>
                <input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-white/[0.1] rounded-md px-3 py-2 text-xs text-[#e4e1e9]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#cbc3d7] mb-1">Starting Notes / Prompt</label>
                <textarea
                  rows={2}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  className="w-full bg-[#0a0a0f] border border-white/[0.1] rounded-md px-3 py-2 text-xs text-[#e4e1e9]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="btn-kinetic px-4 py-2 rounded-md text-xs text-[#cbc3d7] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={creatingId === selectedTemplate.id}
                onClick={() => handleInstantiate(selectedTemplate, customName, customPrompt)}
                className="btn-synthetic px-4 py-2 rounded-md text-xs font-medium text-white cursor-pointer"
              >
                Create Project Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
