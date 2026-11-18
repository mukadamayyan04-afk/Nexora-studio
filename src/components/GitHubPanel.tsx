import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  FolderGit2,
  GitBranch,
  History,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import type {
  GitHubCommitInfo,
  GitHubConnectionStatus,
  GitHubRepoInfo,
  NexoraProject,
} from '../types/nexora';

interface GitHubPanelProps {
  project: NexoraProject;
  onProjectUpdated: (project: NexoraProject) => void;
  onOpenSettings?: () => void;
}

export const GitHubPanel: React.FC<GitHubPanelProps> = ({
  project,
  onProjectUpdated,
  onOpenSettings,
}) => {
  const [status, setStatus] = useState<GitHubConnectionStatus | null>(null);
  const [repos, setRepos] = useState<GitHubRepoInfo[]>([]);
  const [commits, setCommits] = useState<GitHubCommitInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);
  const [commitMessage, setCommitMessage] = useState(`Update ${project.name} from Nexora Studio`);
  const [pushConfirmOpen, setPushConfirmOpen] = useState(false);
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/github/status');
      const data = (await res.json()) as { status: GitHubConnectionStatus };
      setStatus(data.status);
      if (data.status.connected) {
        const repoRes = await fetch('/api/github/repos');
        if (repoRes.ok) {
          const rData = (await repoRes.json()) as { repos: GitHubRepoInfo[] };
          setRepos(rData.repos || []);
        }
        if (project.github) {
          const cRes = await fetch(
            `/api/github/repos/${encodeURIComponent(project.github.owner)}/${encodeURIComponent(
              project.github.repo
            )}/commits?branch=${encodeURIComponent(project.github.branch)}`
          );
          if (cRes.ok) {
            const cData = (await cRes.json()) as { commits: GitHubCommitInfo[] };
            setCommits(cData.commits || []);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [project.github]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'OAUTH_AUTH_SUCCESS') {
        void refreshStatus();
      } else if (e.data?.type === 'OAUTH_AUTH_ERROR') {
        setError(e.data?.message || 'GitHub OAuth failed');
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [refreshStatus]);

  const handleSignIn = async () => {
    setError(null);
    const res = await fetch('/api/github/auth/url');
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setError(data.error || 'Unable to start GitHub OAuth flow.');
      return;
    }
    window.open(data.url, 'nexora_github_oauth', 'width=600,height=720');
  };

  const handleDisconnect = async () => {
    await fetch('/api/github/disconnect', { method: 'POST' });
    setRepos([]);
    setCommits([]);
    void refreshStatus();
  };

  const handleLinkRepo = async (repo: GitHubRepoInfo) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/github/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: repo.owner,
          repo: repo.name,
          branch: repo.defaultBranch,
        }),
      });
      const data = (await res.json()) as { project?: NexoraProject; error?: string };
      if (!res.ok || !data.project) throw new Error(data.error || 'Failed to link repository');
      onProjectUpdated(data.project);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAndLinkRepo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRepoName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/github/repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRepoName.trim(),
          description: project.prompt.slice(0, 140),
          isPrivate: newRepoPrivate,
        }),
      });
      const data = (await res.json()) as { repo?: GitHubRepoInfo; error?: string };
      if (!res.ok || !data.repo) throw new Error(data.error || 'Repo creation failed');
      setNewRepoName('');
      await handleLinkRepo(data.repo);
      void refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async (resolution?: 'overwrite_local' | 'merge_keep_local') => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/github/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });
      const data = (await res.json()) as {
        status?: 'up_to_date' | 'pulled' | 'conflict';
        conflicts?: string[];
        project?: NexoraProject;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || 'Pull failed');
      if (data.status === 'conflict') {
        setConflicts(data.conflicts || []);
      } else {
        setConflicts(null);
        if (data.project) onProjectUpdated(data.project);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handlePush = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/github/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitMessage, confirm: true }),
      });
      const data = (await res.json()) as { project?: NexoraProject; error?: string };
      if (!res.ok || !data.project) throw new Error(data.error || 'Push failed');
      setPushConfirmOpen(false);
      onProjectUpdated(data.project);
      void refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 text-xs text-[#958ea0] flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Checking GitHub OAuth status...</span>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 text-xs overflow-y-auto flex-1">
      {error && (
        <div className="p-2 rounded bg-[#93000a]/25 border border-[#ffb4ab]/35 text-[#ffdad6] text-[11px]">
          {error}
        </div>
      )}

      {!status?.connected ? (
        <div className="space-y-2.5">
          <div className="p-3 rounded-lg bg-[#0a0a0f]/80 border border-white/[0.07] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-display font-semibold text-[#e4e1e9] flex items-center gap-1.5">
                <FolderGit2 className="w-3.5 h-3.5 text-[#4cd7f6]" />
                <span>GitHub Sync</span>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.1] font-mono text-[10px] text-[#cbc3d7]">
                Not Connected
              </span>
            </div>
            <p className="text-[11px] text-[#958ea0]">
              Optional integration. Connect via official GitHub OAuth to sync repositories and push
              commits. Local workspace editing &amp; ZIP exports work without GitHub.
            </p>
            <button
              type="button"
              disabled={!status?.oauthConfigured}
              onClick={handleSignIn}
              className="btn-synthetic w-full py-1.5 rounded text-xs font-medium text-white cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
            >
              Sign in with GitHub OAuth
            </button>
          </div>
          {status && !status.oauthConfigured && (
            <div className="p-2.5 rounded bg-[#131318] border border-white/[0.06] text-[10.5px] font-mono text-[#958ea0] space-y-1.5">
              <div className="text-[#d0bcff]">OAuth Credentials Not Configured</div>
              <div>Set GITHUB_CLIENT_ID &amp; GITHUB_CLIENT_SECRET in server environment secrets.</div>
              <div className="truncate" title={status.callbackUrls.active}>
                Callback: {status.callbackUrls.active}
              </div>
              {onOpenSettings && (
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="text-[#4cd7f6] hover:underline cursor-pointer pt-0.5 block"
                >
                  Open Setup Guide in Settings →
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-2.5 rounded-lg bg-[#0a0a0f]/80 border border-white/[0.06] flex items-center justify-between gap-2">
            <span className="font-mono text-[#4cd7f6] truncate">@{status.user?.login}</span>
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-[11px] text-[#958ea0] hover:text-[#ffb4ab] cursor-pointer"
            >
              Disconnect
            </button>
          </div>

          {project.github ? (
            <div className="space-y-2.5">
              <div className="p-2.5 rounded-lg bg-[#131318] border border-[#8b5cf6]/35 space-y-1">
                <div className="font-mono text-[#e4e1e9] truncate">
                  {project.github.owner}/{project.github.repo}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-[#958ea0] font-mono">
                  <GitBranch className="w-3 h-3 text-[#4cd7f6]" />
                  <span>{project.github.branch}</span>
                  {project.github.lastSyncedSha && (
                    <span>· {project.github.lastSyncedSha.slice(0, 7)}</span>
                  )}
                </div>
              </div>

              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handlePull()}
                  className="btn-kinetic flex-1 py-1.5 rounded flex items-center justify-center gap-1 text-[11px] cursor-pointer"
                >
                  <ArrowDownToLine className="w-3 h-3" />
                  <span>Pull</span>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPushConfirmOpen(true)}
                  className="btn-synthetic flex-1 py-1.5 rounded flex items-center justify-center gap-1 text-[11px] text-white cursor-pointer"
                >
                  <ArrowUpFromLine className="w-3 h-3" />
                  <span>Push</span>
                </button>
              </div>

              {conflicts && (
                <div className="p-2.5 rounded-lg bg-[#93000a]/25 border border-[#ffb4ab]/40 space-y-2">
                  <div className="flex items-center gap-1.5 text-[#ffb4ab] font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Merge Conflicts ({conflicts.length})</span>
                  </div>
                  <div className="text-[10.5px] font-mono text-[#ffdad6] max-h-20 overflow-y-auto">
                    {conflicts.join(', ')}
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => handlePull('merge_keep_local')}
                      className="btn-kinetic flex-1 py-1 rounded text-[10.5px] cursor-pointer"
                    >
                      Keep Local Edits
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePull('overwrite_local')}
                      className="px-2 py-1 rounded bg-[#93000a] text-white text-[10.5px] cursor-pointer"
                    >
                      Accept Remote
                    </button>
                  </div>
                </div>
              )}

              {pushConfirmOpen && (
                <div className="p-2.5 rounded-lg bg-[#131318] border border-[#06b6d4]/45 space-y-2">
                  <div className="text-[11px] font-semibold text-[#e4e1e9]">
                    Confirm Push to {project.github.owner}/{project.github.repo}@{project.github.branch}
                  </div>
                  <input
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    placeholder="Commit message..."
                    className="w-full bg-[#0a0a0f] border border-white/[0.1] rounded px-2 py-1 text-[11px] text-[#e4e1e9]"
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPushConfirmOpen(false)}
                      className="btn-kinetic flex-1 py-1 rounded text-[11px] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy || !commitMessage.trim()}
                      onClick={handlePush}
                      className="btn-synthetic flex-1 py-1 rounded text-[11px] text-white cursor-pointer"
                    >
                      {busy ? 'Pushing...' : 'Confirm Push'}
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[11px] text-[#958ea0]">
                  <span className="flex items-center gap-1">
                    <History className="w-3 h-3" /> Commits
                  </span>
                  <button type="button" onClick={refreshStatus} className="cursor-pointer">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
                {commits.slice(0, 6).map((c) => (
                  <div
                    key={c.sha}
                    className="p-2 rounded bg-[#0a0a0f]/75 border border-white/[0.05] text-[10.5px]"
                  >
                    <div className="text-[#e4e1e9] truncate">{c.message}</div>
                    <div className="text-[#958ea0] font-mono">
                      {c.sha.slice(0, 7)} · {c.author}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <form onSubmit={handleCreateAndLinkRepo} className="space-y-1.5">
                <div className="text-[11px] text-[#cbc3d7] font-medium">Create New Repository</div>
                <input
                  value={newRepoName}
                  onChange={(e) => setNewRepoName(e.target.value)}
                  placeholder="new-repo-name"
                  className="w-full bg-[#0a0a0f] border border-white/[0.1] rounded px-2 py-1 text-[11px] text-[#e4e1e9]"
                />
                <label className="flex items-center gap-1.5 text-[11px] text-[#958ea0]">
                  <input
                    type="checkbox"
                    checked={newRepoPrivate}
                    onChange={(e) => setNewRepoPrivate(e.target.checked)}
                  />
                  Private repository
                </label>
                <button
                  type="submit"
                  disabled={busy || !newRepoName.trim()}
                  className="btn-synthetic w-full py-1.5 rounded flex items-center justify-center gap-1 text-[11px] text-white cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Create &amp; Link Repo</span>
                </button>
              </form>

              <div className="space-y-1.5">
                <div className="text-[11px] text-[#cbc3d7] font-medium">Or Link Existing Repo</div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {repos.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => handleLinkRepo(r)}
                      className="w-full flex items-center justify-between gap-1 px-2 py-1.5 rounded bg-[#0a0a0f]/75 hover:bg-white/[0.06] border border-white/[0.05] text-[11px] text-left cursor-pointer"
                    >
                      <span className="truncate font-mono text-[#e4e1e9]">{r.fullName}</span>
                      <Link2 className="w-3 h-3 text-[#4cd7f6] shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
