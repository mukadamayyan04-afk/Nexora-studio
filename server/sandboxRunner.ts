import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import type { Request, Response } from 'express';
import type { NexoraProject, ProjectRuntimeStatus } from '../src/types/nexora.ts';
import { DEFAULT_USER_ID, WORKSPACES_DIR, dbGetProject, dbGetProjectForPreview } from './database.ts';
import { writeWorkspaceFilesToDisk } from './projectEngine.ts';

interface RunnerInstance {
  projectId: string;
  ownerId: string;
  status: ProjectRuntimeStatus['status'];
  port: number | null;
  pid: number | null;
  entryFile: string | null;
  process: ChildProcess | null;
  logs: string[];
  lastError: string | null;
  startedAt: string | null;
  lastAccessedAt: number;
  isStaticFallback: boolean;
}

const runners = new Map<string, RunnerInstance>();
const MAX_ACTIVE_RUNNERS = 4;
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

function pushLog(runner: RunnerInstance, msg: string) {
  const stamped = `[${new Date().toLocaleTimeString()}] ${msg}`;
  runner.logs.push(stamped);
  if (runner.logs.length > 150) {
    runner.logs.splice(0, runner.logs.length - 150);
  }
}

async function findFreePort(start = 4100, end = 4199): Promise<number> {
  for (let p = start; p <= end; p++) {
    const ok = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.once('listening', () => {
        server.close(() => resolve(true));
      });
      server.listen(p, '127.0.0.1');
    });
    if (ok) return p;
  }
  throw new Error('No ephemeral sandbox ports available (4100-4199).');
}

async function waitForPortReady(port: number, timeoutMs = 4500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const alive = await new Promise<boolean>((resolve) => {
      const sock = net.createConnection({ port, host: '127.0.0.1' }, () => {
        sock.destroy();
        resolve(true);
      });
      sock.on('error', () => {
        sock.destroy();
        resolve(false);
      });
    });
    if (alive) return true;
    await new Promise((r) => setTimeout(r, 120));
  }
  return false;
}

function detectNodeServerEntry(project: NexoraProject, workspaceDir: string): string | null {
  const pkgFile = project.files.find((f) => f.path === 'package.json');
  if (pkgFile) {
    try {
      const parsed = JSON.parse(pkgFile.content) as {
        main?: string;
        scripts?: { start?: string };
      };
      if (parsed.scripts?.start) {
        const match = parsed.scripts.start.match(/node\s+([^\s&;]+)/);
        if (match && fs.existsSync(path.join(workspaceDir, match[1]))) {
          return match[1];
        }
      }
      if (parsed.main && fs.existsSync(path.join(workspaceDir, parsed.main))) {
        return parsed.main;
      }
    } catch {
      // ignore invalid package.json
    }
  }

  for (const candidate of ['server.js', 'server.mjs', 'src/server.js', 'app.js', 'index.js']) {
    if (
      project.files.some((f) => f.path === candidate) &&
      fs.existsSync(path.join(workspaceDir, candidate))
    ) {
      return candidate;
    }
  }
  return null;
}

function buildIsolatedEnv(project: NexoraProject, port: number): NodeJS.ProcessEnv {
  // Strictly strip all parent server secrets (GEMINI_API_KEY, GITHUB_CLIENT_SECRET, etc.)
  const safeEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    NODE_ENV: 'development',
    PORT: String(port),
    HOST: '127.0.0.1',
    NEXORA_SANDBOX: '1',
    NEXORA_PROJECT_ID: project.id,
    NODE_OPTIONS: '--max-old-space-size=128',
  };

  for (const item of project.envVars || []) {
    const k = item.key.trim();
    if (!k || !/^[A-Z0-9_]+$/i.test(k)) continue;
    if (['PATH', 'PORT', 'HOST', 'NODE_OPTIONS', 'LD_PRELOAD', 'LD_LIBRARY_PATH'].includes(k)) {
      continue;
    }
    safeEnv[k] = item.value;
  }
  return safeEnv;
}

function enforceRunnerCapacity() {
  const active = Array.from(runners.values()).filter(
    (r) => r.status === 'running' || r.status === 'starting'
  );
  if (active.length < MAX_ACTIVE_RUNNERS) return;
  active.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  const oldest = active[0];
  if (oldest) {
    stopProjectRunner(oldest.projectId);
  }
}

export function getRunnerStatus(projectId: string): ProjectRuntimeStatus {
  const runner = runners.get(projectId);
  if (!runner) {
    return {
      projectId,
      status: 'stopped',
      port: null,
      pid: null,
      entryFile: null,
      previewUrl: null,
      logs: [],
      lastError: null,
      startedAt: null,
    };
  }
  return {
    projectId: runner.projectId,
    status: runner.status,
    port: runner.port,
    pid: runner.pid,
    entryFile: runner.entryFile,
    previewUrl:
      runner.status === 'running'
        ? `/api/preview/${encodeURIComponent(runner.projectId)}/`
        : null,
    logs: [...runner.logs],
    lastError: runner.lastError,
    startedAt: runner.startedAt,
  };
}

export function listActiveRunners(): ProjectRuntimeStatus[] {
  return Array.from(runners.values()).map((r) => getRunnerStatus(r.projectId));
}

export function stopProjectRunner(projectId: string): ProjectRuntimeStatus {
  const runner = runners.get(projectId);
  if (!runner) return getRunnerStatus(projectId);
  if (runner.process && !runner.process.killed) {
    try {
      runner.process.kill('SIGTERM');
    } catch {
      // ignore already exited
    }
  }
  runner.process = null;
  runner.status = 'stopped';
  runner.pid = null;
  runner.port = null;
  pushLog(runner, 'Isolated project runtime stopped.');
  return getRunnerStatus(projectId);
}

export async function startProjectRunner(
  projectId: string,
  ownerId = DEFAULT_USER_ID
): Promise<ProjectRuntimeStatus> {
  const project = dbGetProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');

  // Stop existing runner for clean restart
  if (runners.has(projectId)) {
    stopProjectRunner(projectId);
  }

  enforceRunnerCapacity();
  writeWorkspaceFilesToDisk(project);
  const workspaceDir = path.join(WORKSPACES_DIR, project.id);
  const entryFile = detectNodeServerEntry(project, workspaceDir);

  const runner: RunnerInstance = {
    projectId: project.id,
    ownerId,
    status: entryFile ? 'starting' : 'running',
    port: null,
    pid: null,
    entryFile,
    process: null,
    logs: [],
    lastError: null,
    startedAt: new Date().toISOString(),
    lastAccessedAt: Date.now(),
    isStaticFallback: !entryFile,
  };
  runners.set(project.id, runner);

  if (!entryFile) {
    pushLog(
      runner,
      'Static website mode active (no Node server entrypoint detected). Serving workspace files from isolated static handler.'
    );
    return getRunnerStatus(project.id);
  }

  const port = await findFreePort();
  runner.port = port;
  pushLog(runner, `Starting isolated child process: node ${entryFile} on 127.0.0.1:${port}`);

  const env = buildIsolatedEnv(project, port);
  const child = spawn(process.execPath, [entryFile], {
    cwd: workspaceDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  runner.process = child;
  runner.pid = child.pid ?? null;

  child.stdout?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString('utf8').split('\n').filter(Boolean);
    for (const line of lines) pushLog(runner, line);
  });

  child.stderr?.on('data', (chunk: Buffer) => {
    const lines = chunk.toString('utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      pushLog(runner, `[STDERR] ${line}`);
      runner.lastError = line;
    }
  });

  child.on('exit', (code, signal) => {
    if (runner.status !== 'stopped') {
      runner.status = code === 0 ? 'stopped' : 'error';
      if (code !== 0) {
        runner.lastError = `Process exited with code ${code ?? 'null'} (signal: ${signal ?? 'none'})`;
      }
      pushLog(runner, `Child process exited (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`);
    }
    runner.process = null;
    runner.pid = null;
  });

  const ready = await waitForPortReady(port, 4500);
  if (ready && runner.process) {
    runner.status = 'running';
    pushLog(runner, `Isolated backend server listening on port ${port}.`);
  } else if (runner.status !== 'stopped') {
    runner.status = 'error';
    if (!runner.lastError) {
      runner.lastError = `Server process failed to bind port ${port} within 4.5s.`;
    }
    pushLog(runner, `[ERROR] ${runner.lastError}`);
  }

  return getRunnerStatus(project.id);
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function handleSandboxProxyRequest(req: Request, res: Response) {
  const projectId = req.params.projectId;
  const project = dbGetProjectForPreview(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project workspace not found.' });
  }

  const subPath = '/' + (req.params[0] || '');
  const queryStart = req.originalUrl.indexOf('?');
  const queryString = queryStart >= 0 ? req.originalUrl.slice(queryStart) : '';
  const runner = runners.get(projectId);

  if (runner) {
    runner.lastAccessedAt = Date.now();
  }

  // If isolated Node backend process is running, proxy request directly to it
  if (runner && runner.status === 'running' && !runner.isStaticFallback && runner.port) {
    const proxyReq = http.request(
      {
        hostname: '127.0.0.1',
        port: runner.port,
        path: `${subPath}${queryString}`,
        method: req.method,
        headers: {
          ...req.headers,
          host: `127.0.0.1:${runner.port}`,
        },
        timeout: 10000,
      },
      (proxyRes) => {
        res.status(proxyRes.statusCode || 200);
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (v !== undefined && k.toLowerCase() !== 'transfer-encoding') {
            res.setHeader(k, v);
          }
        }
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', (err) => {
      pushLog(runner, `[PROXY_ERROR] ${err.message}`);
      res.status(502).json({ error: `Preview runtime connection failed: ${err.message}` });
    });

    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body && Object.keys(req.body).length > 0) {
      const payload = JSON.stringify(req.body);
      proxyReq.setHeader('content-type', 'application/json');
      proxyReq.setHeader('content-length', Buffer.byteLength(payload));
      proxyReq.write(payload);
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
    return;
  }

  // Static workspace file fallback (for static HTML/CSS/JS websites & playable HTML5 games)
  writeWorkspaceFilesToDisk(project);
  const workspaceDir = path.join(WORKSPACES_DIR, project.id);
  const cleanSub = subPath.replace(/^\/+/, '') || 'index.html';
  const candidates = [
    path.join(workspaceDir, cleanSub),
    path.join(workspaceDir, 'public', cleanSub),
    path.join(workspaceDir, 'app/src/main/assets', cleanSub),
  ];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (!resolved.startsWith(path.resolve(workspaceDir))) continue;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      const ext = path.extname(resolved).toLowerCase();
      res.setHeader('Content-Type', MIME_MAP[ext] || 'application/octet-stream');
      return res.sendFile(resolved);
    }
  }

  if (project.previewHtml) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(project.previewHtml);
  }
  return res.status(404).send('Preview entry file not found in project workspace.');
}

// Periodic cleanup of idle runners + graceful process shutdown
setInterval(() => {
  const now = Date.now();
  for (const runner of runners.values()) {
    if (runner.status === 'running' && now - runner.lastAccessedAt > IDLE_TIMEOUT_MS) {
      pushLog(runner, 'Stopping idle sandbox runner after 15m inactivity.');
      stopProjectRunner(runner.projectId);
    }
  }
}, 60_000).unref();

process.on('exit', () => {
  for (const runner of runners.values()) {
    if (runner.process && !runner.process.killed) {
      try {
        runner.process.kill('SIGTERM');
      } catch {
        // ignore
      }
    }
  }
});
