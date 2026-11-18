export type TopNavSection =
  | 'home'
  | 'models'
  | 'templates'
  | 'projects'
  | 'workspace'
  | 'monitor'
  | 'settings'
  | 'profile'
  | 'studio';

export type ProjectType = 'android-apk' | 'game-2d' | 'game-3d' | 'website';

export type ModelCategory =
  | 'coding'
  | 'general'
  | 'reasoning'
  | 'game-dev'
  | 'writing'
  | 'image-gen';

export type ProviderStatus =
  | 'connected'
  | 'unconfigured'
  | 'auth_error'
  | 'unreachable'
  | 'rate_limited';

export type GenerationStatus =
  | 'idle'
  | 'awaiting_provider'
  | 'queued'
  | 'generating'
  | 'completed'
  | 'error';

export interface AIModelInfo {
  id: string;
  providerId: string;
  name: string;
  contextWindow: string;
  categories: ModelCategory[];
  freeAccessConfirmed: boolean;
  freeAccessLabel: string;
  usageLimitations: string;
  available: boolean;
  unavailableReason?: string;
}

export interface AIProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  authType: 'none' | 'env-managed' | 'bearer' | 'local';
  isBuiltIn: boolean;
  requiresKey: boolean;
  hasKey: boolean;
  status: ProviderStatus;
  statusMessage: string;
  freeTierSummary: string;
  quotaNote: string;
  lastCheckedAt: string | null;
  latencyMs: number | null;
  models: AIModelInfo[];
}

export interface ProjectFile {
  path: string;
  language: string;
  content: string;
}

export interface GeneratedGameAsset {
  id: string;
  name: string;
  kind: 'sprite' | 'texture' | 'tileset' | 'ui-icon' | 'audio' | 'font' | '3d-json';
  svgMarkup: string;
  dataUrl?: string;
  mimeType?: string;
  sizeBytes?: number;
  targetPath: string;
  approved: boolean;
  source?: 'ai' | 'upload';
}

export interface DiagnosticItem {
  severity: 'error' | 'warning' | 'info';
  file: string;
  line?: number;
  message: string;
}

export type BuildStatus =
  | 'idle'
  | 'validating'
  | 'building'
  | 'success'
  | 'failed'
  | 'toolchain_unavailable';

export interface BuildReport {
  status: BuildStatus;
  logs: string[];
  diagnostics: DiagnosticItem[];
  apkAvailable: boolean;
  apkFilename?: string;
  apkSizeBytes?: number;
  toolchain: {
    java: boolean;
    gradle: boolean;
    androidSdk: boolean;
    remoteRunner: boolean;
  };
  timestamp: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  modelUsed?: string;
  modifiedFiles?: string[];
  versionId?: string;
  timestamp: string;
}

export interface ReferenceAttachment {
  name: string;
  mimeType: string;
  size: number;
  contentPreview: string;
}

export interface FreeFallbackOption {
  modelId: string;
  modelName: string;
  providerId: string;
  providerName: string;
  freeAccessLabel: string;
}

export interface ProjectHistoryEntry {
  id: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface ProjectVersion {
  id: string;
  label: string;
  kind: 'checkpoint' | 'ai-edit' | 'restore' | 'manual' | 'import' | 'template';
  summary: string;
  filesSnapshot: ProjectFile[];
  previewHtmlSnapshot: string;
  createdAt: string;
}

export interface ProjectEnvVar {
  key: string;
  value: string;
}

export interface TestCaseResult {
  id: string;
  name: string;
  category: 'syntax' | 'structure' | 'runtime' | 'api' | 'artifact';
  passed: boolean;
  message: string;
  durationMs: number;
}

export interface TestRunResult {
  id: string;
  status: 'passed' | 'failed';
  total: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  cases: TestCaseResult[];
  timestamp: string;
}

export interface ProjectRuntimeStatus {
  projectId: string;
  status: 'stopped' | 'starting' | 'running' | 'error';
  port: number | null;
  pid: number | null;
  entryFile: string | null;
  previewUrl: string | null;
  logs: string[];
  lastError: string | null;
  startedAt: string | null;
}

export interface GitHubLinkMetadata {
  owner: string;
  repo: string;
  branch: string;
  lastSyncedSha?: string;
  lastSyncedAt?: string;
}

export interface NexoraProject {
  id: string;
  ownerId?: string;
  name: string;
  type: ProjectType;
  prompt: string;
  gameGenre?: string;
  attachments?: ReferenceAttachment[];
  selectedModelId: string;
  selectedProviderName: string;
  smartRouting: boolean;
  generationStatus: GenerationStatus;
  generationStep: string;
  generationProgress: number;
  generationError: string | null;
  fallbackSuggestions?: FreeFallbackOption[];
  files: ProjectFile[];
  pendingAssets: GeneratedGameAsset[];
  previewHtml: string;
  chat: ChatMessage[];
  build: BuildReport;
  history?: ProjectHistoryEntry[];
  versions?: ProjectVersion[];
  redoVersions?: ProjectVersion[];
  envVars?: ProjectEnvVar[];
  testRuns?: TestRunResult[];
  github?: GitHubLinkMetadata;
  importMetadata?: {
    source: 'zip' | 'github' | 'template';
    detectedFramework: string;
    dependencies: string[];
    warnings: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface BackgroundJob {
  id: string;
  ownerId: string;
  projectId?: string;
  projectName?: string;
  type:
    | 'ai_generate'
    | 'ai_edit'
    | 'preview_server'
    | 'android_build'
    | 'test_run'
    | 'github_sync'
    | 'project_import'
    | 'export';
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  step: string;
  logs: string[];
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  type: ProjectType;
  category: 'Full-Stack Web' | 'Android App' | '2D Game' | '3D Game' | 'Backend API';
  gameGenre?: string;
  description: string;
  techStack: string[];
  defaultPrompt: string;
  previewHtml: string;
  files: ProjectFile[];
  envVars?: ProjectEnvVar[];
}

export interface ErrorFixProposal {
  id: string;
  summary: string;
  rootCause: string;
  affectedFiles: string[];
  proposedFiles: ProjectFile[];
  proposedPreviewHtml?: string;
  modelUsed?: string;
}

export interface GitHubConnectionStatus {
  oauthConfigured: boolean;
  connected: boolean;
  callbackUrls: {
    dev: string;
    shared: string;
    active: string;
  };
  user?: {
    login: string;
    name: string;
    avatarUrl: string;
    htmlUrl: string;
  };
  error?: string;
}

export interface GitHubRepoInfo {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl: string;
  description: string | null;
  updatedAt: string;
}

export interface GitHubCommitInfo {
  sha: string;
  message: string;
  author: string;
  date: string;
  htmlUrl: string;
}

export interface SystemMonitorSnapshot {
  server: {
    status: 'healthy';
    uptimeSeconds: number;
    nodeVersion: string;
    memoryRssMb: number;
    memoryHeapUsedMb: number;
    pid: number;
  };
  database: {
    engine: string;
    status: 'connected';
    projectCount: number;
    jobCount: number;
  };
  auth: {
    sessionIsolation: 'header-scoped';
    githubOAuthConfigured: boolean;
    githubConnected: boolean;
  };
  androidBuild: {
    serviceConfigured: boolean;
    localToolchainReady: boolean;
    java: boolean;
    gradle: boolean;
    androidSdk: boolean;
  };
  ai: {
    connectedProviders: number;
    totalProviders: number;
    availableFreeModels: number;
  };
  runners: ProjectRuntimeStatus[];
  jobs: BackgroundJob[];
  apiLogs: Array<{
    id: string;
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
    timestamp: string;
  }>;
}

export interface UserProfile {
  id: string;
  displayName: string;
  handle: string;
  email: string;
  role: string;
  bio: string;
  avatarInitials: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  defaultProjectType: ProjectType;
  smartRouting: boolean;
  preferredModelId: string;
  editorTabSize: 2 | 4;
  autoSaveOnBlur: boolean;
  compactDensity: boolean;
  accentPreset: 'violet-cyan' | 'cyan-emerald' | 'amber-violet';
  updatedAt: string;
}
