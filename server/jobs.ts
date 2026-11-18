import fs from 'node:fs';
import path from 'node:path';
import type { BackgroundJob } from '../src/types/nexora.ts';
import { DATA_DIR, DEFAULT_USER_ID, ensureDatabaseDirs, writeJsonAtomic } from './database.ts';

const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

function readAllJobs(): BackgroundJob[] {
  ensureDatabaseDirs();
  if (!fs.existsSync(JOBS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8')) as BackgroundJob[];
  } catch {
    return [];
  }
}

function writeAllJobs(jobs: BackgroundJob[]) {
  writeJsonAtomic(JOBS_FILE, jobs.slice(0, 150));
}

export function listJobs(ownerId?: string): BackgroundJob[] {
  const all = readAllJobs();
  const filtered = ownerId ? all.filter((j) => j.ownerId === ownerId) : all;
  return filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function getJob(jobId: string, ownerId?: string): BackgroundJob | undefined {
  const found = readAllJobs().find((j) => j.id === jobId);
  if (!found) return undefined;
  if (ownerId && found.ownerId !== ownerId) return undefined;
  return found;
}

export function createJob(input: {
  ownerId?: string;
  projectId?: string;
  projectName?: string;
  type: BackgroundJob['type'];
  step: string;
  initialLog?: string;
}): BackgroundJob {
  const now = new Date().toISOString();
  const job: BackgroundJob = {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ownerId: input.ownerId || DEFAULT_USER_ID,
    projectId: input.projectId,
    projectName: input.projectName,
    type: input.type,
    status: 'queued',
    progress: 10,
    step: input.step,
    logs: [
      `[${new Date().toLocaleTimeString()}] ${input.initialLog || input.step}`,
    ],
    error: null,
    createdAt: now,
    updatedAt: now,
  };
  const all = readAllJobs();
  all.unshift(job);
  writeAllJobs(all);
  return job;
}

export function updateJob(
  jobId: string,
  patch: Partial<Pick<BackgroundJob, 'status' | 'progress' | 'step' | 'error'>> & {
    appendLog?: string;
  }
): BackgroundJob | undefined {
  const all = readAllJobs();
  const idx = all.findIndex((j) => j.id === jobId);
  if (idx < 0) return undefined;

  const existing = all[idx];
  const nextLogs = patch.appendLog
    ? [...existing.logs, `[${new Date().toLocaleTimeString()}] ${patch.appendLog}`].slice(-80)
    : existing.logs;

  const updated: BackgroundJob = {
    ...existing,
    status: patch.status ?? existing.status,
    progress: patch.progress ?? existing.progress,
    step: patch.step ?? existing.step,
    error: patch.error !== undefined ? patch.error : existing.error,
    logs: nextLogs,
    updatedAt: new Date().toISOString(),
  };
  all[idx] = updated;
  writeAllJobs(all);
  return updated;
}

export function cancelJob(jobId: string, ownerId = DEFAULT_USER_ID): BackgroundJob | undefined {
  const existing = getJob(jobId, ownerId);
  if (!existing) return undefined;
  if (existing.status === 'completed' || existing.status === 'failed') {
    return existing;
  }
  return updateJob(jobId, {
    status: 'cancelled',
    step: 'Cancelled by user',
    appendLog: 'Job cancelled by user request.',
  });
}
