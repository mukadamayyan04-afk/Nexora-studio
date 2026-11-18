import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  GitHubCommitInfo,
  GitHubConnectionStatus,
  GitHubRepoInfo,
  NexoraProject,
  ProjectFile,
} from '../src/types/nexora.ts';
import {
  DATA_DIR,
  DEFAULT_USER_ID,
  dbAppendProjectHistory,
  dbGetProject,
  dbUpsertProject,
  ensureDatabaseDirs,
  writeJsonAtomic,
} from './database.ts';
import { inspectImportedFiles } from './importer.ts';
import {
  detectAndroidToolchain,
  upsertProject,
  validateProjectStructure,
  workspaceFileManager,
} from './projectEngine.ts';
import { appendProjectVersion } from './versionHistory.ts';

interface StoredGitHubAuth {
  accessToken: string;
  user: {
    login: string;
    name: string;
    avatarUrl: string;
    htmlUrl: string;
  };
  connectedAt: string;
}

const GITHUB_FILE = path.join(DATA_DIR, 'github-auth.json');
const pendingOAuthStates = new Map<string, { ownerId: string; createdAt: number }>();

const DEV_ORIGIN = 'https://ais-dev-hp6avwp54mgk53oflfklgu-129146398497.asia-east1.run.app';
const SHARED_ORIGIN = 'https://ais-pre-hp6avwp54mgk53oflfklgu-129146398497.asia-east1.run.app';

function readAuthMap(): Record<string, StoredGitHubAuth> {
  ensureDatabaseDirs();
  if (!fs.existsSync(GITHUB_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(GITHUB_FILE, 'utf8')) as Record<string, StoredGitHubAuth>;
  } catch {
    return {};
  }
}

function writeAuthMap(map: Record<string, StoredGitHubAuth>) {
  writeJsonAtomic(GITHUB_FILE, map);
}

export function getActiveCallbackUrls(requestOrigin?: string) {
  const appBase = (process.env.APP_URL || requestOrigin || DEV_ORIGIN).replace(/\/+$/, '');
  return {
    dev: `${DEV_ORIGIN}/api/github/callback`,
    shared: `${SHARED_ORIGIN}/api/github/callback`,
    active: `${appBase}/api/github/callback`,
  };
}

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim()
  );
}

export async function getGitHubStatus(
  ownerId = DEFAULT_USER_ID,
  requestOrigin?: string
): Promise<GitHubConnectionStatus> {
  const callbackUrls = getActiveCallbackUrls(requestOrigin);
  const oauthConfigured = isGitHubOAuthConfigured();
  const map = readAuthMap();
  const entry = map[ownerId];

  if (!entry || !entry.accessToken) {
    return {
      oauthConfigured,
      connected: false,
      callbackUrls,
    };
  }

  // Verify live token against GitHub API
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${entry.accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Nexora-Studio',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      delete map[ownerId];
      writeAuthMap(map);
      return {
        oauthConfigured,
        connected: false,
        callbackUrls,
        error: `GitHub session expired or revoked (HTTP ${res.status}). Reconnect via OAuth.`,
      };
    }
    const ghUser = (await res.json()) as {
      login: string;
      name?: string;
      avatar_url?: string;
      html_url?: string;
    };
    return {
      oauthConfigured,
      connected: true,
      callbackUrls,
      user: {
        login: ghUser.login,
        name: ghUser.name || ghUser.login,
        avatarUrl: ghUser.avatar_url || entry.user.avatarUrl,
        htmlUrl: ghUser.html_url || entry.user.htmlUrl,
      },
    };
  } catch (err) {
    return {
      oauthConfigured,
      connected: true,
      callbackUrls,
      user: entry.user,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function createGitHubAuthUrl(ownerId = DEFAULT_USER_ID, requestOrigin?: string): string {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId || !process.env.GITHUB_CLIENT_SECRET) {
    throw new Error(
      'GitHub OAuth credentials (GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET) are not configured on the server.'
    );
  }
  const state = crypto.randomBytes(20).toString('hex');
  pendingOAuthStates.set(state, { ownerId, createdAt: Date.now() });

  // Prune stale states older than 15 minutes
  for (const [k, v] of pendingOAuthStates.entries()) {
    if (Date.now() - v.createdAt > 15 * 60 * 1000) pendingOAuthStates.delete(k);
  }

  const { active } = getActiveCallbackUrls(requestOrigin);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: active,
    scope: 'repo read:user',
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function handleGitHubOAuthCallback(input: {
  code?: string;
  state?: string;
  requestOrigin?: string;
}): Promise<{ ok: boolean; message: string }> {
  if (!input.code || !input.state) {
    return { ok: false, message: 'Missing OAuth code or state parameter.' };
  }
  const pending = pendingOAuthStates.get(input.state);
  if (!pending) {
    return { ok: false, message: 'Invalid or expired OAuth state parameter.' };
  }
  pendingOAuthStates.delete(input.state);

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, message: 'GitHub OAuth credentials are not configured.' };
  }

  const { active } = getActiveCallbackUrls(input.requestOrigin);
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code: input.code,
      redirect_uri: active,
    }),
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; error_description?: string };
  if (!tokenData.access_token) {
    return {
      ok: false,
      message: tokenData.error_description || 'Failed to exchange authorization code for token.',
    };
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Nexora-Studio',
    },
  });
  if (!userRes.ok) {
    return { ok: false, message: `GitHub user lookup failed (HTTP ${userRes.status}).` };
  }
  const ghUser = (await userRes.json()) as {
    login: string;
    name?: string;
    avatar_url?: string;
    html_url?: string;
  };

  const map = readAuthMap();
  map[pending.ownerId] = {
    accessToken: tokenData.access_token,
    user: {
      login: ghUser.login,
      name: ghUser.name || ghUser.login,
      avatarUrl: ghUser.avatar_url || '',
      htmlUrl: ghUser.html_url || `https://github.com/${ghUser.login}`,
    },
    connectedAt: new Date().toISOString(),
  };
  writeAuthMap(map);

  return { ok: true, message: `Connected GitHub account @${ghUser.login}` };
}

export function disconnectGitHub(ownerId = DEFAULT_USER_ID) {
  const map = readAuthMap();
  delete map[ownerId];
  writeAuthMap(map);
}

function requireToken(ownerId = DEFAULT_USER_ID): string {
  const entry = readAuthMap()[ownerId];
  if (!entry?.accessToken) {
    throw new Error('GitHub account is not connected. Sign in via GitHub OAuth first.');
  }
  return entry.accessToken;
}

async function ghFetch<T>(token: string, apiPath: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${apiPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Nexora-Studio',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as T & { message?: string }) : ({} as T);
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `GitHub API HTTP ${res.status}`);
  }
  return data;
}

export async function listUserRepos(ownerId = DEFAULT_USER_ID): Promise<GitHubRepoInfo[]> {
  const token = requireToken(ownerId);
  const repos = await ghFetch<
    Array<{
      id: number;
      name: string;
      full_name: string;
      owner: { login: string };
      private: boolean;
      default_branch: string;
      html_url: string;
      description: string | null;
      updated_at: string;
    }>
  >(token, '/user/repos?sort=updated&per_page=40');

  return repos.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner.login,
    private: r.private,
    defaultBranch: r.default_branch || 'main',
    htmlUrl: r.html_url,
    description: r.description,
    updatedAt: r.updated_at,
  }));
}

export async function createUserRepo(
  ownerId: string,
  input: { name: string; description?: string; isPrivate?: boolean }
): Promise<GitHubRepoInfo> {
  const token = requireToken(ownerId);
  const created = await ghFetch<{
    id: number;
    name: string;
    full_name: string;
    owner: { login: string };
    private: boolean;
    default_branch: string;
    html_url: string;
    description: string | null;
    updated_at: string;
  }>(token, '/user/repos', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      description: input.description?.trim() || 'Created from Nexora Studio',
      private: Boolean(input.isPrivate),
      auto_init: true,
    }),
  });

  return {
    id: created.id,
    name: created.name,
    fullName: created.full_name,
    owner: created.owner.login,
    private: created.private,
    defaultBranch: created.default_branch || 'main',
    htmlUrl: created.html_url,
    description: created.description,
    updatedAt: created.updated_at,
  };
}

export async function listRepoCommits(
  ownerId: string,
  input: { owner: string; repo: string; branch?: string }
): Promise<GitHubCommitInfo[]> {
  const token = requireToken(ownerId);
  const branchParam = input.branch ? `&sha=${encodeURIComponent(input.branch)}` : '';
  const commits = await ghFetch<
    Array<{
      sha: string;
      html_url: string;
      commit: { message: string; author?: { name?: string; date?: string } };
    }>
  >(token, `/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/commits?per_page=15${branchParam}`);

  return commits.map((c) => ({
    sha: c.sha,
    message: c.commit.message,
    author: c.commit.author?.name || 'GitHub User',
    date: c.commit.author?.date || '',
    htmlUrl: c.html_url,
  }));
}

async function fetchRepoTreeFiles(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<{ commitSha: string; files: ProjectFile[] }> {
  const ref = await ghFetch<{ object: { sha: string } }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`
  );
  const commitSha = ref.object.sha;
  const commit = await ghFetch<{ tree: { sha: string } }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits/${commitSha}`
  );
  const tree = await ghFetch<{
    tree: Array<{ path: string; type: string; sha: string; size?: number }>;
  }>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${commit.tree.sha}?recursive=1`
  );

  const blobs = tree.tree
    .filter(
      (item) =>
        item.type === 'blob' &&
        (item.size ?? 0) < 220_000 &&
        !item.path.startsWith('node_modules/') &&
        !item.path.startsWith('.git/')
    )
    .slice(0, 80);

  const files: ProjectFile[] = [];
  for (const item of blobs) {
    const blob = await ghFetch<{ content: string; encoding: string }>(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${item.sha}`
    );
    const content =
      blob.encoding === 'base64'
        ? Buffer.from(blob.content.replace(/\n/g, ''), 'base64').toString('utf8')
        : blob.content;
    const ext = path.extname(item.path).toLowerCase();
    const language =
      ext === '.ts' || ext === '.tsx'
        ? 'typescript'
        : ext === '.js'
        ? 'javascript'
        : ext === '.kt'
        ? 'kotlin'
        : ext === '.html'
        ? 'html'
        : ext === '.css'
        ? 'css'
        : ext === '.json'
        ? 'json'
        : ext === '.xml'
        ? 'xml'
        : 'text';
    files.push({ path: item.path, language, content });
  }

  return { commitSha, files };
}

export async function importRepoAsProject(
  ownerId: string,
  input: { owner: string; repo: string; branch: string }
): Promise<NexoraProject> {
  const token = requireToken(ownerId);
  const { commitSha, files } = await fetchRepoTreeFiles(token, input.owner, input.repo, input.branch);
  if (files.length === 0) {
    throw new Error('Selected repository branch contains no importable text source files.');
  }

  const inspection = inspectImportedFiles(files);
  const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const toolchain = await detectAndroidToolchain();
  const html = files.find((f) => f.path === 'index.html' || f.path.endsWith('/index.html'))?.content;
  const diagnostics = validateProjectStructure(files, inspection.type);

  workspaceFileManager.ensureWorkspaceDirectories(projectId, ['src']);

  let project: NexoraProject = {
    id: projectId,
    ownerId,
    name: input.repo,
    type: inspection.type,
    prompt: `Imported from GitHub repository ${input.owner}/${input.repo}@${input.branch}.`,
    selectedModelId: 'github-import',
    selectedProviderName: 'GitHub Repository',
    smartRouting: true,
    generationStatus: 'completed',
    generationStep: `Imported ${files.length} files from ${input.owner}/${input.repo}`,
    generationProgress: 100,
    generationError: null,
    files,
    pendingAssets: [],
    previewHtml:
      html ||
      `<!doctype html><html><body style="background:#0a0a0f;color:#cbc3d7;font-family:system-ui;padding:24px"><h3>${input.owner}/${input.repo}</h3><p>Branch: ${input.branch} · Commit: ${commitSha.slice(0, 7)}</p></body></html>`,
    chat: [
      {
        id: `msg-gh-${Date.now()}`,
        role: 'assistant',
        content: `Cloned **${input.owner}/${input.repo}** (${input.branch}, commit \`${commitSha.slice(0, 7)}\`).\n- Detected: ${inspection.detectedFramework}\n- Files: ${files.length}`,
        modifiedFiles: files.slice(0, 20).map((f) => f.path),
        timestamp: now,
      },
    ],
    build: {
      status: 'idle',
      logs: [`[${new Date().toLocaleTimeString()}] Imported ${input.owner}/${input.repo}@${input.branch} (${files.length} files).`],
      diagnostics,
      apkAvailable: false,
      toolchain,
      timestamp: now,
    },
    github: {
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      lastSyncedSha: commitSha,
      lastSyncedAt: now,
    },
    importMetadata: {
      source: 'github',
      detectedFramework: inspection.detectedFramework,
      dependencies: inspection.dependencies,
      warnings: inspection.warnings,
    },
    createdAt: now,
    updatedAt: now,
  };

  project = appendProjectVersion(project, 'GitHub Import', 'import', `${input.owner}/${input.repo}@${commitSha.slice(0, 7)}`);
  return upsertProject(project);
}

export function connectProjectToRepo(
  ownerId: string,
  projectId: string,
  input: { owner: string; repo: string; branch: string }
): NexoraProject {
  const project = dbGetProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  const updated = dbUpsertProject({
    ...project,
    github: {
      owner: input.owner,
      repo: input.repo,
      branch: input.branch,
      lastSyncedAt: project.github?.lastSyncedAt,
      lastSyncedSha: project.github?.lastSyncedSha,
    },
  });
  return (
    dbAppendProjectHistory(
      projectId,
      'github_connected',
      `Linked workspace to ${input.owner}/${input.repo} (${input.branch}).`,
      ownerId
    ) || updated
  );
}

export async function pullRepoUpdates(
  ownerId: string,
  projectId: string,
  resolution?: 'overwrite_local' | 'merge_keep_local'
): Promise<{
  status: 'up_to_date' | 'pulled' | 'conflict';
  conflicts?: string[];
  remoteSha?: string;
  project: NexoraProject;
}> {
  const token = requireToken(ownerId);
  const project = dbGetProject(projectId, ownerId);
  if (!project || !project.github) {
    throw new Error('Project is not linked to a GitHub repository.');
  }

  const { owner, repo, branch, lastSyncedSha } = project.github;
  const { commitSha, files: remoteFiles } = await fetchRepoTreeFiles(token, owner, repo, branch);

  if (lastSyncedSha && lastSyncedSha === commitSha) {
    return { status: 'up_to_date', remoteSha: commitSha, project };
  }

  // Detect modified paths comparing local files vs remote files
  const localMap = new Map(project.files.map((f) => [f.path, f.content]));
  const conflictingPaths = remoteFiles
    .filter((rf) => {
      const localContent = localMap.get(rf.path);
      return localContent !== undefined && localContent !== rf.content;
    })
    .map((rf) => rf.path);

  if (conflictingPaths.length > 0 && !resolution) {
    return {
      status: 'conflict',
      conflicts: conflictingPaths,
      remoteSha: commitSha,
      project,
    };
  }

  // Create checkpoint before applying pull
  let updated = appendProjectVersion(
    project,
    `Before GitHub Pull (${commitSha.slice(0, 7)})`,
    'checkpoint',
    `Saved local files before pulling ${owner}/${repo}@${branch}`
  );

  let nextFiles: ProjectFile[];
  if (resolution === 'merge_keep_local') {
    const remoteAdditions = remoteFiles.filter((rf) => !localMap.has(rf.path));
    nextFiles = [...updated.files, ...remoteAdditions];
  } else {
    nextFiles = remoteFiles;
  }

  const nextHtml =
    nextFiles.find((f) => f.path === 'index.html' || f.path.endsWith('/index.html'))?.content ||
    updated.previewHtml;

  updated = upsertProject({
    ...updated,
    files: nextFiles,
    previewHtml: nextHtml,
    github: {
      owner,
      repo,
      branch,
      lastSyncedSha: commitSha,
      lastSyncedAt: new Date().toISOString(),
    },
  });

  return {
    status: 'pulled',
    remoteSha: commitSha,
    project:
      dbAppendProjectHistory(
        projectId,
        'github_pulled',
        `Pulled ${owner}/${repo}@${branch} (${commitSha.slice(0, 7)}).`,
        ownerId
      ) || updated,
  };
}

export async function pushProjectToGitHub(
  ownerId: string,
  projectId: string,
  input: { commitMessage: string; confirm: boolean }
): Promise<{ commitSha: string; commitUrl: string; project: NexoraProject }> {
  if (!input.confirm) {
    throw new Error('Explicit user confirmation is required before pushing changes to GitHub.');
  }
  const message = input.commitMessage.trim();
  if (!message) {
    throw new Error('Commit message is required.');
  }

  const token = requireToken(ownerId);
  const project = dbGetProject(projectId, ownerId);
  if (!project || !project.github) {
    throw new Error('Connect this project to a GitHub repository first.');
  }

  const { owner, repo, branch } = project.github;
  const repoPath = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const ref = await ghFetch<{ object: { sha: string } }>(
    token,
    `${repoPath}/git/ref/heads/${encodeURIComponent(branch)}`
  );
  const parentSha = ref.object.sha;
  const parentCommit = await ghFetch<{ tree: { sha: string } }>(
    token,
    `${repoPath}/git/commits/${parentSha}`
  );

  // Create blobs for all text project files
  const treeEntries: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
  for (const file of project.files) {
    const cleanPath = file.path.replace(/^\/+/, '');
    if (!cleanPath || file.language === 'binary-ref') continue;
    const blob = await ghFetch<{ sha: string }>(token, `${repoPath}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
    });
    treeEntries.push({
      path: cleanPath,
      mode: '100644',
      type: 'blob',
      sha: blob.sha,
    });
  }

  const newTree = await ghFetch<{ sha: string }>(token, `${repoPath}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: parentCommit.tree.sha,
      tree: treeEntries,
    }),
  });

  const newCommit = await ghFetch<{ sha: string; html_url: string }>(token, `${repoPath}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: newTree.sha,
      parents: [parentSha],
    }),
  });

  await ghFetch(token, `${repoPath}/git/refs/heads/${encodeURIComponent(branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: newCommit.sha, force: false }),
  });

  const updated = dbUpsertProject({
    ...project,
    github: {
      owner,
      repo,
      branch,
      lastSyncedSha: newCommit.sha,
      lastSyncedAt: new Date().toISOString(),
    },
  });

  const finalProj =
    dbAppendProjectHistory(
      projectId,
      'github_pushed',
      `Pushed ${treeEntries.length} file(s) to ${owner}/${repo}@${branch} (${newCommit.sha.slice(0, 7)}).`,
      ownerId
    ) || updated;

  return {
    commitSha: newCommit.sha,
    commitUrl: newCommit.html_url,
    project: finalProj,
  };
}
