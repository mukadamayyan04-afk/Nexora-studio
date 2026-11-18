import type { NextFunction, Request, Response } from 'express';
import type { SystemMonitorSnapshot } from '../src/types/nexora.ts';
import { DEFAULT_USER_ID, dbListProjects } from './database.ts';
import { listJobs } from './jobs.ts';
import { listProviders } from './modelHub.ts';
import { listActiveRunners } from './sandboxRunner.ts';

interface ApiLogEntry {
  id: string;
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
}

const apiLogRing: ApiLogEntry[] = [];
const MAX_LOGS = 80;

export function apiMonitorMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api/') || req.path === '/api/monitor/snapshot') {
    return next();
  }
  const start = Date.now();
  res.on('finish', () => {
    apiLogRing.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    });
    if (apiLogRing.length > MAX_LOGS) {
      apiLogRing.length = MAX_LOGS;
    }
  });
  next();
}

export function buildMonitorSnapshot(
  ownerId = DEFAULT_USER_ID,
  githubState: { oauthConfigured: boolean; connected: boolean },
  toolchain: { java: boolean; gradle: boolean; androidSdk: boolean; remoteRunner: boolean }
): SystemMonitorSnapshot {
  const mem = process.memoryUsage();
  const providers = listProviders();
  const connectedProviders = providers.filter((p) => p.status === 'connected');
  const availableModels = connectedProviders.reduce(
    (sum, p) => sum + p.models.filter((m) => m.available).length,
    0
  );
  const projects = dbListProjects(ownerId);
  const jobs = listJobs(ownerId);

  return {
    server: {
      status: 'healthy',
      uptimeSeconds: Math.round(process.uptime()),
      nodeVersion: process.version,
      memoryRssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      memoryHeapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      pid: process.pid,
    },
    database: {
      engine: 'atomic-json-store (.nexora-data)',
      status: 'connected',
      projectCount: projects.length,
      jobCount: jobs.length,
    },
    auth: {
      sessionIsolation: 'header-scoped',
      githubOAuthConfigured: githubState.oauthConfigured,
      githubConnected: githubState.connected,
    },
    androidBuild: {
      serviceConfigured: toolchain.remoteRunner,
      localToolchainReady: toolchain.java && toolchain.gradle && toolchain.androidSdk,
      java: toolchain.java,
      gradle: toolchain.gradle,
      androidSdk: toolchain.androidSdk,
    },
    ai: {
      connectedProviders: connectedProviders.length,
      totalProviders: providers.length,
      availableFreeModels: availableModels,
    },
    runners: listActiveRunners(),
    jobs: jobs.slice(0, 30),
    apiLogs: [...apiLogRing],
  };
}
