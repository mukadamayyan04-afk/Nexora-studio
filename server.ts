import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  dbGetProfile,
  dbGetSettings,
  dbUpdateProfile,
  dbUpdateSettings,
  defaultSettings,
  resolveRequestUserId,
} from './server/database.ts';
import { generateProjectDocumentation } from './server/docsGenerator.ts';
import { applyErrorFixAndVerify, diagnoseProjectErrors } from './server/errorFixer.ts';
import {
  connectProjectToRepo,
  createGitHubAuthUrl,
  createUserRepo,
  disconnectGitHub,
  getGitHubStatus,
  handleGitHubOAuthCallback,
  importRepoAsProject,
  isGitHubOAuthConfigured,
  listRepoCommits,
  listUserRepos,
  pullRepoUpdates,
  pushProjectToGitHub,
} from './server/githubService.ts';
import { importProjectFromZipBase64 } from './server/importer.ts';
import { cancelJob, createJob, listJobs, updateJob } from './server/jobs.ts';
import {
  addCustomFreeProvider,
  addFreeModelToProvider,
  configureProviderKey,
  ensureInitialProbe,
  getFreeFallbackSuggestions,
  listProviders,
  refreshAllProvidersAvailability,
  routeFreeModel,
  testProviderConnection,
  triggerStartupProbe,
} from './server/modelHub.ts';
import { apiMonitorMiddleware, buildMonitorSnapshot } from './server/monitoring.ts';
import {
  addUploadedAsset,
  chatWithProject,
  createAssetsZipBuffer,
  createInstantProject,
  createProjectZipBuffer,
  deleteProject,
  deleteProjectFile,
  detectAndroidToolchain,
  duplicateProject,
  getProject,
  getRealApkPath,
  listProjects,
  projectEvents,
  removePendingAsset,
  renameProject,
  renameProjectFile,
  runBackgroundProjectGeneration,
  runProjectBuild,
  saveProjectSnapshot,
  updateProjectEnvVars,
  upsertProject,
  validateProjectStructure,
} from './server/projectEngine.ts';
import {
  getRunnerStatus,
  handleSandboxProxyRequest,
  startProjectRunner,
  stopProjectRunner,
} from './server/sandboxRunner.ts';
import { createProjectFromTemplate, listTemplates } from './server/templates.ts';
import { runProjectTestSuite } from './server/testingEngine.ts';
import {
  computeVersionDiff,
  createManualCheckpoint,
  redoProjectChange,
  restoreProjectVersion,
  undoLastProjectChange,
} from './server/versionHistory.ts';
import type {
  ErrorFixProposal,
  GeneratedGameAsset,
  ModelCategory,
  NexoraProject,
  ProjectEnvVar,
  ProjectFile,
  ProjectType,
  ReferenceAttachment,
  UserSettings,
} from './src/types/nexora.ts';

function getRequestOrigin(req: express.Request): string {
  const proto = (req.headers['x-forwarded-proto'] as string)?.split(',')[0] || req.protocol || 'https';
  const host = (req.headers['x-forwarded-host'] as string)?.split(',')[0] || req.get('host');
  return host ? `${proto}://${host}` : '';
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '20mb' }));
  app.use(apiMonitorMiddleware);

  // Initial availability probe in background on startup
  void triggerStartupProbe();

  app.get('/api/health', async (_req, res) => {
    const toolchain = await detectAndroidToolchain();
    res.json({
      ok: true,
      database: 'local-json-store',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      githubOAuthConfigured: isGitHubOAuthConfigured(),
      androidBuildConfigured: toolchain.remoteRunner,
      toolchain,
    });
  });

  // Backend Control Center & Jobs APIs
  app.get('/api/monitor/snapshot', async (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const [ghStatus, toolchain] = await Promise.all([
      getGitHubStatus(userId, getRequestOrigin(req)),
      detectAndroidToolchain(),
    ]);
    res.json({
      snapshot: buildMonitorSnapshot(
        userId,
        {
          oauthConfigured: ghStatus.oauthConfigured,
          connected: ghStatus.connected,
        },
        toolchain
      ),
    });
  });

  app.get('/api/jobs', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    res.json({ jobs: listJobs(userId) });
  });

  app.post('/api/jobs/:jobId/cancel', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const job = cancelJob(req.params.jobId, userId);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    res.json({ job });
  });

  // Templates & Importer APIs
  app.get('/api/templates', (_req, res) => {
    res.json({ templates: listTemplates() });
  });

  app.post('/api/templates/create', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { templateId, customName, customPrompt } = req.body as {
        templateId: string;
        customName?: string;
        customPrompt?: string;
      };
      const project = await createProjectFromTemplate({
        templateId,
        customName,
        customPrompt,
        ownerId: userId,
      });
      res.status(201).json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/import/zip', async (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const job = createJob({
      ownerId: userId,
      type: 'project_import',
      step: 'Extracting and validating uploaded ZIP archive',
    });
    try {
      const { zipBase64, projectName } = req.body as { zipBase64: string; projectName?: string };
      const project = await importProjectFromZipBase64({
        zipBase64,
        projectName,
        ownerId: userId,
      });
      updateJob(job.id, {
        status: 'completed',
        progress: 100,
        step: `Imported ${project.files.length} files (${project.name})`,
      });
      res.status(201).json({ project });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateJob(job.id, { status: 'failed', step: 'ZIP import failed', error: msg });
      res.status(400).json({ error: msg });
    }
  });

  // User Profile & Settings APIs
  app.get('/api/user/profile', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    res.json({ profile: dbGetProfile(userId) });
  });

  app.put('/api/user/profile', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const profile = dbUpdateProfile(req.body || {}, userId);
      res.json({ profile });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/user/settings', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    res.json({ settings: dbGetSettings(userId) });
  });

  app.put('/api/user/settings', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const patch = (req.body || {}) as Partial<Omit<UserSettings, 'updatedAt'>>;
      const settings = dbUpdateSettings(patch, userId);
      res.json({ settings });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/user/settings/reset', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const defaults = defaultSettings();
    const settings = dbUpdateSettings(defaults, userId);
    res.json({ settings });
  });

  // AI Model Hub APIs
  app.get('/api/models/providers', async (_req, res) => {
    await ensureInitialProbe(2000);
    res.json({ providers: listProviders() });
  });

  app.post('/api/models/availability/refresh', async (_req, res) => {
    const providers = await refreshAllProvidersAvailability();
    res.json({ providers });
  });

  app.post('/api/models/providers/key', (req, res) => {
    try {
      const { providerId, apiKey } = req.body as { providerId: string; apiKey: string };
      configureProviderKey(providerId, apiKey || '');
      res.json({ providers: listProviders() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/models/providers/custom', (req, res) => {
    try {
      const { name, baseUrl, apiKey, modelId, modelName, category, freeAccessConfirmed } =
        req.body as {
          name: string;
          baseUrl: string;
          apiKey?: string;
          modelId: string;
          modelName: string;
          category: ModelCategory;
          freeAccessConfirmed: boolean;
        };
      const id = addCustomFreeProvider({
        name,
        baseUrl,
        apiKey,
        modelId,
        modelName,
        category: category || 'general',
        freeAccessConfirmed: Boolean(freeAccessConfirmed),
      });
      res.json({ providerId: id, providers: listProviders() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/models/providers/model', (req, res) => {
    try {
      const { providerId, modelId, modelName, contextWindow, category, freeAccessConfirmed } =
        req.body as {
          providerId: string;
          modelId: string;
          modelName: string;
          contextWindow?: string;
          category: ModelCategory;
          freeAccessConfirmed: boolean;
        };
      const model = addFreeModelToProvider({
        providerId,
        modelId,
        modelName,
        contextWindow,
        category: category || 'general',
        freeAccessConfirmed: Boolean(freeAccessConfirmed),
      });
      res.json({ model, providers: listProviders() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/models/providers/:id/test', async (req, res) => {
    try {
      const updated = await testProviderConnection(req.params.id);
      res.json({ provider: updated, providers: listProviders() });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/models/route', (req, res) => {
    try {
      const { category, preferredModelId } = req.body as {
        category: ModelCategory;
        preferredModelId?: string;
      };
      const routed = routeFreeModel(category || 'coding', preferredModelId);
      res.json(routed);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : String(err),
        fallbackSuggestions: getFreeFallbackSuggestions('coding'),
      });
    }
  });

  // Official GitHub OAuth & Repository APIs
  app.get('/api/github/status', async (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const status = await getGitHubStatus(userId, getRequestOrigin(req));
    res.json({ status });
  });

  app.get('/api/github/auth/url', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const url = createGitHubAuthUrl(userId, getRequestOrigin(req));
      res.json({ url });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get(['/api/github/callback', '/api/github/callback/'], async (req, res) => {
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const result = await handleGitHubOAuthCallback({
      code,
      state,
      requestOrigin: getRequestOrigin(req),
    });
    res.send(`<!doctype html>
<html>
  <body style="background:#0a0a0f;color:#e4e1e9;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">
    <div>
      <h3>${result.ok ? 'GitHub Connected' : 'GitHub Connection Failed'}</h3>
      <p style="font-size:13px;color:#cbc3d7">${result.message.replace(/</g, '&lt;')}</p>
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: '${result.ok ? 'OAUTH_AUTH_SUCCESS' : 'OAUTH_AUTH_ERROR'}', message: ${JSON.stringify(
            result.message
          )} }, '*');
          window.close();
        }
      </script>
    </div>
  </body>
</html>`);
  });

  app.post('/api/github/disconnect', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    disconnectGitHub(userId);
    res.json({ disconnected: true });
  });

  app.get('/api/github/repos', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const repos = await listUserRepos(userId);
      res.json({ repos });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/github/repos', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { name, description, isPrivate } = req.body as {
        name: string;
        description?: string;
        isPrivate?: boolean;
      };
      const repo = await createUserRepo(userId, { name, description, isPrivate });
      res.status(201).json({ repo });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/github/repos/:owner/:repo/commits', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const branch = typeof req.query.branch === 'string' ? req.query.branch : undefined;
      const commits = await listRepoCommits(userId, {
        owner: req.params.owner,
        repo: req.params.repo,
        branch,
      });
      res.json({ commits });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/github/import', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { owner, repo, branch } = req.body as { owner: string; repo: string; branch: string };
      const project = await importRepoAsProject(userId, { owner, repo, branch: branch || 'main' });
      res.status(201).json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Projects & Instant Workspace APIs (User-Scoped)
  app.get('/api/projects', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    res.json({ projects: listProjects(userId) });
  });

  app.get('/api/projects/:id', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const project = getProject(req.params.id, userId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json({ project });
  });

  app.post('/api/projects/create', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { prompt, type, gameGenre, selectedModelId, smartRouting, attachments } = req.body as {
        prompt: string;
        type: ProjectType;
        gameGenre?: string;
        selectedModelId?: string;
        smartRouting?: boolean;
        attachments?: ReferenceAttachment[];
      };

      const project = await createInstantProject({
        ownerId: userId,
        prompt,
        type: type || 'android-apk',
        gameGenre,
        selectedModelId,
        smartRouting: smartRouting ?? true,
        attachments,
      });
      res.status(201).json({ project });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Unable to initialize project.',
        fallbackSuggestions: getFreeFallbackSuggestions('coding'),
      });
    }
  });

  // Real-time Server-Sent Events stream for workspace generation progress
  app.get('/api/projects/:id/events', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const project = getProject(req.params.id, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendProject = (proj: NexoraProject) => {
      res.write(`data: ${JSON.stringify(proj)}\n\n`);
    };

    sendProject(project);

    const listener = (updated: NexoraProject) => sendProject(updated);
    const eventName = `project:${req.params.id}`;
    projectEvents.on(eventName, listener);

    req.on('close', () => {
      projectEvents.off(eventName, listener);
      res.end();
    });
  });

  app.post('/api/projects/:id/retry', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const project = getProject(req.params.id, userId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const { modelId } = (req.body || {}) as { modelId?: string };

    const updated = upsertProject({
      ...project,
      selectedModelId: modelId || project.selectedModelId,
      smartRouting: modelId ? false : project.smartRouting,
      generationStatus: 'queued',
      generationStep: 'Queued AI generation...',
      generationProgress: 15,
      generationError: null,
    });

    void runBackgroundProjectGeneration(project.id, modelId);
    res.json({ project: updated });
  });

  app.post('/api/projects/:id/save', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const project = saveProjectSnapshot(req.params.id, userId);
      res.json({ project });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch('/api/projects/:id', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { name } = req.body as { name: string };
      const project = renameProject(req.params.id, name, userId);
      res.json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:id/duplicate', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const project = duplicateProject(req.params.id, userId);
      res.status(201).json({ project });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // File Explorer CRUD + Env Vars
  app.put('/api/projects/:id/files', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const project = getProject(req.params.id, userId);
      if (!project) return res.status(404).json({ error: 'Project not found.' });

      const { path: rawPath, content, language } = req.body as ProjectFile;
      const filePath = typeof rawPath === 'string' ? rawPath.trim().replace(/^\/+/, '').replace(/\.\./g, '') : '';
      if (!filePath) {
        return res.status(400).json({ error: 'Valid file path is required.' });
      }
      const nextFiles = [...project.files];
      const idx = nextFiles.findIndex((f) => f.path === filePath);
      if (idx >= 0) {
        nextFiles[idx] = { ...nextFiles[idx], content };
      } else {
        nextFiles.push({ path: filePath, language: language || 'text', content: content ?? '' });
      }

      const nextPreview =
        filePath.endsWith('index.html') && content ? content : project.previewHtml;

      const updated = upsertProject({
        ...project,
        files: nextFiles,
        previewHtml: nextPreview,
        build: {
          ...project.build,
          diagnostics: validateProjectStructure(nextFiles, project.type),
        },
      });
      res.json({ project: updated });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/projects/:id/files', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const filePath = (req.body as { path?: string })?.path || (req.query.path as string);
      if (!filePath) return res.status(400).json({ error: 'File path is required.' });
      const project = deleteProjectFile(req.params.id, filePath, userId);
      res.json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.patch('/api/projects/:id/files/rename', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { oldPath, newPath } = req.body as { oldPath: string; newPath: string };
      const project = renameProjectFile(req.params.id, oldPath, newPath, userId);
      res.json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.put('/api/projects/:id/env', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { envVars } = req.body as { envVars: ProjectEnvVar[] };
      const project = updateProjectEnvVars(req.params.id, envVars || [], userId);
      res.json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Asset Studio APIs
  app.post('/api/projects/:id/assets/upload', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const asset = req.body as Omit<GeneratedGameAsset, 'id' | 'approved' | 'source'>;
      const project = addUploadedAsset(req.params.id, asset, userId);
      res.status(201).json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:id/assets/:assetId/approve', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const project = getProject(req.params.id, userId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const targetAsset = project.pendingAssets.find((a) => a.id === req.params.assetId);
    if (!targetAsset) return res.status(404).json({ error: 'Asset not found.' });

    const nextPending = project.pendingAssets.map((a) =>
      a.id === targetAsset.id ? { ...a, approved: true } : a
    );
    const nextFiles = [...project.files];
    const fileContent = targetAsset.svgMarkup || targetAsset.dataUrl || '';
    const lang = targetAsset.targetPath.endsWith('.json')
      ? 'json'
      : targetAsset.targetPath.endsWith('.svg') || targetAsset.targetPath.endsWith('.xml')
      ? 'xml'
      : 'text';
    const existingIdx = nextFiles.findIndex((f) => f.path === targetAsset.targetPath);
    if (existingIdx >= 0) {
      nextFiles[existingIdx] = { path: targetAsset.targetPath, language: lang, content: fileContent };
    } else {
      nextFiles.push({ path: targetAsset.targetPath, language: lang, content: fileContent });
    }

    const updated = upsertProject({
      ...project,
      pendingAssets: nextPending,
      files: nextFiles,
    });
    res.json({ project: updated });
  });

  app.delete('/api/projects/:id/assets/:assetId', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const project = removePendingAsset(req.params.id, req.params.assetId, userId);
      res.json({ project });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Version History, Checkpoints, Diff, Undo & Redo APIs
  app.post('/api/projects/:id/versions', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { label, summary } = req.body as { label: string; summary?: string };
      const result = createManualCheckpoint(req.params.id, label, summary, userId);
      res.status(201).json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/projects/:id/versions/:versionId/diff', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const project = getProject(req.params.id, userId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const version = (project.versions || []).find((v) => v.id === req.params.versionId);
    if (!version) return res.status(404).json({ error: 'Version snapshot not found.' });
    res.json({
      versionId: version.id,
      label: version.label,
      diffs: computeVersionDiff(project.files, version.filesSnapshot),
    });
  });

  app.post('/api/projects/:id/versions/:versionId/restore', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const project = restoreProjectVersion(req.params.id, req.params.versionId, userId);
      res.json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:id/undo', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const project = undoLastProjectChange(req.params.id, userId);
      res.json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:id/redo', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const project = redoProjectChange(req.params.id, userId);
      res.json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // AI Development Chat
  app.post('/api/projects/:id/chat', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { message, activeFilePath, selectedModelId, smartRouting } = req.body as {
        message: string;
        activeFilePath?: string;
        selectedModelId?: string;
        smartRouting?: boolean;
      };
      if (!message || !message.trim()) {
        return res.status(400).json({ error: 'Chat message is required.' });
      }
      const project = await chatWithProject({
        projectId: req.params.id,
        ownerId: userId,
        message: message.trim(),
        activeFilePath,
        selectedModelId,
        smartRouting,
      });
      res.json({ project });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
        fallbackSuggestions: getFreeFallbackSuggestions('coding', req.body?.selectedModelId),
      });
    }
  });

  // Isolated Backend Runtime Server & HTTP Preview Proxy
  app.get('/api/projects/:id/runtime', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const project = getProject(req.params.id, userId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json({ runtime: getRunnerStatus(project.id) });
  });

  app.post('/api/projects/:id/runtime/start', async (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const project = getProject(req.params.id, userId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const job = createJob({
      ownerId: userId,
      projectId: project.id,
      projectName: project.name,
      type: 'preview_server',
      step: 'Starting isolated project server',
    });
    try {
      const runtime = await startProjectRunner(project.id, userId);
      updateJob(job.id, {
        status: runtime.status === 'error' ? 'failed' : 'completed',
        progress: 100,
        step: runtime.status === 'running' ? `Running on port ${runtime.port || 'static'}` : 'Runtime failed',
        error: runtime.lastError,
      });
      res.json({ runtime });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateJob(job.id, { status: 'failed', step: 'Runtime start failed', error: msg });
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/projects/:id/runtime/stop', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const project = getProject(req.params.id, userId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    res.json({ runtime: stopProjectRunner(project.id) });
  });

  // Live Preview Reverse Proxy (normalizes trailing slash so relative fetch('api/...') resolves inside project scope)
  app.all('/api/preview/:projectId', (req, res) => {
    if (req.method === 'GET' && !req.originalUrl.split('?')[0].endsWith('/')) {
      return res.redirect(302, `${req.originalUrl}/`);
    }
    return handleSandboxProxyRequest(req, res);
  });
  app.all('/api/preview/:projectId/*', handleSandboxProxyRequest);

  // Build, Tests, Error Fixer, Documentation & GitHub Project Sync
  app.post('/api/projects/:id/build', async (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const proj = getProject(req.params.id, userId);
    const job = createJob({
      ownerId: userId,
      projectId: req.params.id,
      projectName: proj?.name,
      type: 'android_build',
      step: 'Running build & project validation',
    });
    try {
      const project = await runProjectBuild(req.params.id, userId);
      updateJob(job.id, {
        status: project.build.status === 'failed' ? 'failed' : 'completed',
        progress: 100,
        step: `Build finished: ${project.build.status}`,
      });
      res.json({ project });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateJob(job.id, { status: 'failed', step: 'Build failed', error: msg });
      res.status(500).json({ error: msg });
    }
  });

  app.post('/api/projects/:id/tests/run', async (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const proj = getProject(req.params.id, userId);
    const job = createJob({
      ownerId: userId,
      projectId: req.params.id,
      projectName: proj?.name,
      type: 'test_run',
      step: 'Executing workspace verification checks',
    });
    try {
      const result = await runProjectTestSuite(req.params.id, userId);
      updateJob(job.id, {
        status: result.testRun.status === 'passed' ? 'completed' : 'failed',
        progress: 100,
        step: `Tests: ${result.testRun.passedCount}/${result.testRun.total} passed`,
      });
      res.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateJob(job.id, { status: 'failed', step: 'Test run error', error: msg });
      res.status(400).json({ error: msg });
    }
  });

  app.post('/api/projects/:id/errors/diagnose', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { selectedModelId, smartRouting } = (req.body || {}) as {
        selectedModelId?: string;
        smartRouting?: boolean;
      };
      const proposal = await diagnoseProjectErrors({
        projectId: req.params.id,
        ownerId: userId,
        selectedModelId,
        smartRouting,
      });
      res.json({ proposal });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:id/errors/apply', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { proposal } = req.body as { proposal: ErrorFixProposal };
      const result = await applyErrorFixAndVerify({
        projectId: req.params.id,
        proposal,
        ownerId: userId,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:id/docs/generate', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const result = generateProjectDocumentation(req.params.id, userId);
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:id/github/connect', (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { owner, repo, branch } = req.body as { owner: string; repo: string; branch: string };
      const project = connectProjectToRepo(userId, req.params.id, {
        owner,
        repo,
        branch: branch || 'main',
      });
      res.json({ project });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:id/github/pull', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { resolution } = (req.body || {}) as {
        resolution?: 'overwrite_local' | 'merge_keep_local';
      };
      const result = await pullRepoUpdates(userId, req.params.id, resolution);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/projects/:id/github/push', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { commitMessage, confirm } = req.body as { commitMessage: string; confirm: boolean };
      const result = await pushProjectToGitHub(userId, req.params.id, { commitMessage, confirm });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Export Center Downloads
  app.get('/api/projects/:id/apk', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const apkPath = getRealApkPath(req.params.id, userId);
    if (!apkPath) {
      return res.status(404).json({
        error: 'No compiled APK artifact exists for this project.',
      });
    }
    const project = getProject(req.params.id, userId);
    const filename = project?.build.apkFilename || 'app-debug.apk';
    res.download(apkPath, filename);
  });

  app.get('/api/projects/:id/export', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { buffer, filename } = await createProjectZipBuffer(req.params.id, userId);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/projects/:id/export/assets', async (req, res) => {
    try {
      const userId = resolveRequestUserId(req.headers['x-nexora-user']);
      const { buffer, filename } = await createAssetsZipBuffer(req.params.id, userId);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get('/api/projects/:id/export/game-html', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    const project = getProject(req.params.id, userId);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || project.id;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-playable.html"`);
    res.send(project.previewHtml || '<!doctype html><html><body>No HTML bundle</body></html>');
  });

  app.delete('/api/projects/:id', (req, res) => {
    const userId = resolveRequestUserId(req.headers['x-nexora-user']);
    stopProjectRunner(req.params.id);
    const removed = deleteProject(req.params.id, userId);
    res.json({ removed });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Nexora Studio server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
