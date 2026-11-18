import fs from 'node:fs';
import path from 'node:path';
import type {
  NexoraProject,
  ProjectHistoryEntry,
  UserProfile,
  UserSettings,
} from '../src/types/nexora.ts';

export const DATA_DIR = path.resolve(process.cwd(), '.nexora-data');
export const WORKSPACES_DIR = path.join(DATA_DIR, 'workspaces');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export const DEFAULT_USER_ID = 'studio-owner';

export function ensureDatabaseDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(WORKSPACES_DIR)) fs.mkdirSync(WORKSPACES_DIR, { recursive: true });
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  ensureDatabaseDirs();
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function writeJsonAtomic(filePath: string, data: unknown) {
  ensureDatabaseDirs();
  const tmpPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

export function resolveRequestUserId(rawHeader?: string | string[]): string {
  const candidate = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (candidate && /^[a-zA-Z0-9_-]{3,48}$/.test(candidate.trim())) {
    return candidate.trim();
  }
  return DEFAULT_USER_ID;
}

// ==================================================
// PROJECTS PERSISTENCE (User-Scoped + History)
// ==================================================

export function dbListProjects(ownerId = DEFAULT_USER_ID): NexoraProject[] {
  const all = readJsonFile<NexoraProject[]>(PROJECTS_FILE, []);
  return all
    .filter((p) => !p.ownerId || p.ownerId === ownerId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function dbGetProject(id: string, ownerId = DEFAULT_USER_ID): NexoraProject | undefined {
  const all = readJsonFile<NexoraProject[]>(PROJECTS_FILE, []);
  const found = all.find((p) => p.id === id);
  if (!found) return undefined;
  if (found.ownerId && found.ownerId !== ownerId) return undefined;
  return found;
}

export function dbGetProjectForPreview(id: string): NexoraProject | undefined {
  const all = readJsonFile<NexoraProject[]>(PROJECTS_FILE, []);
  return all.find((p) => p.id === id);
}

export function dbSaveAllProjects(projects: NexoraProject[]) {
  writeJsonAtomic(PROJECTS_FILE, projects);
}

export function dbUpsertProject(project: NexoraProject): NexoraProject {
  const all = readJsonFile<NexoraProject[]>(PROJECTS_FILE, []);
  const idx = all.findIndex((p) => p.id === project.id);
  const now = new Date().toISOString();
  const normalized: NexoraProject = {
    ...project,
    ownerId: project.ownerId || DEFAULT_USER_ID,
    updatedAt: now,
  };
  if (idx >= 0) {
    all[idx] = normalized;
  } else {
    all.unshift(normalized);
  }
  dbSaveAllProjects(all);
  return normalized;
}

export function dbAppendProjectHistory(
  projectId: string,
  action: string,
  detail: string,
  ownerId = DEFAULT_USER_ID
): NexoraProject | undefined {
  const existing = dbGetProject(projectId, ownerId);
  if (!existing) return undefined;
  const entry: ProjectHistoryEntry = {
    id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    action,
    detail,
    timestamp: new Date().toISOString(),
  };
  const nextHistory = [entry, ...(existing.history || [])].slice(0, 50);
  return dbUpsertProject({
    ...existing,
    history: nextHistory,
  });
}

export function dbDeleteProject(id: string, ownerId = DEFAULT_USER_ID): boolean {
  const all = readJsonFile<NexoraProject[]>(PROJECTS_FILE, []);
  const target = all.find((p) => p.id === id);
  if (!target) return false;
  if (target.ownerId && target.ownerId !== ownerId) return false;
  const filtered = all.filter((p) => p.id !== id);
  dbSaveAllProjects(filtered);
  return true;
}

// ==================================================
// USER PROFILE PERSISTENCE
// ==================================================

function defaultProfileFor(userId: string): UserProfile {
  const now = new Date().toISOString();
  return {
    id: userId,
    displayName: 'Nexora Creator',
    handle: 'nexora_architect',
    email: 'creator@nexora.studio',
    role: 'App & Game Architect',
    bio: 'Building Android APKs, interactive games, and web applications in Nexora Studio.',
    avatarInitials: 'NC',
    createdAt: now,
    updatedAt: now,
  };
}

export function dbGetProfile(userId = DEFAULT_USER_ID): UserProfile {
  const map = readJsonFile<Record<string, UserProfile>>(PROFILES_FILE, {});
  if (map[userId]) return map[userId];
  const initial = defaultProfileFor(userId);
  map[userId] = initial;
  writeJsonAtomic(PROFILES_FILE, map);
  return initial;
}

export function dbUpdateProfile(
  patch: Partial<Pick<UserProfile, 'displayName' | 'handle' | 'email' | 'role' | 'bio'>>,
  userId = DEFAULT_USER_ID
): UserProfile {
  const current = dbGetProfile(userId);
  const displayName =
    patch.displayName !== undefined ? patch.displayName.trim() : current.displayName;
  if (!displayName) {
    throw new Error('Display name cannot be empty.');
  }
  const cleanHandle =
    patch.handle !== undefined
      ? patch.handle.trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_.-]/g, '')
      : current.handle;
  const words = displayName.split(/\s+/).filter(Boolean);
  const avatarInitials =
    words.length >= 2
      ? `${words[0][0]}${words[1][0]}`.toUpperCase()
      : displayName.slice(0, 2).toUpperCase();

  const updated: UserProfile = {
    ...current,
    displayName,
    handle: cleanHandle || current.handle,
    email: patch.email !== undefined ? patch.email.trim() : current.email,
    role: patch.role !== undefined ? patch.role.trim() : current.role,
    bio: patch.bio !== undefined ? patch.bio.trim() : current.bio,
    avatarInitials,
    updatedAt: new Date().toISOString(),
  };

  const map = readJsonFile<Record<string, UserProfile>>(PROFILES_FILE, {});
  map[userId] = updated;
  writeJsonAtomic(PROFILES_FILE, map);
  return updated;
}

// ==================================================
// USER SETTINGS & PREFERENCES PERSISTENCE
// ==================================================

export function defaultSettings(): UserSettings {
  return {
    defaultProjectType: 'android-apk',
    smartRouting: true,
    preferredModelId: 'gemini-4-hydrogen',
    editorTabSize: 2,
    autoSaveOnBlur: false,
    compactDensity: false,
    accentPreset: 'violet-cyan',
    updatedAt: new Date().toISOString(),
  };
}

export function dbGetSettings(userId = DEFAULT_USER_ID): UserSettings {
  const map = readJsonFile<Record<string, UserSettings>>(SETTINGS_FILE, {});
  if (map[userId]) return map[userId];
  const initial = defaultSettings();
  map[userId] = initial;
  writeJsonAtomic(SETTINGS_FILE, map);
  return initial;
}

export function dbUpdateSettings(
  patch: Partial<Omit<UserSettings, 'updatedAt'>>,
  userId = DEFAULT_USER_ID
): UserSettings {
  const current = dbGetSettings(userId);
  const next: UserSettings = {
    ...current,
    ...patch,
    editorTabSize: patch.editorTabSize === 4 ? 4 : patch.editorTabSize === 2 ? 2 : current.editorTabSize,
    updatedAt: new Date().toISOString(),
  };
  const map = readJsonFile<Record<string, UserSettings>>(SETTINGS_FILE, {});
  map[userId] = next;
  writeJsonAtomic(SETTINGS_FILE, map);
  return next;
}
