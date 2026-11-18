import type {
  AIProviderConfig,
  BuildReport,
  DiagnosticItem,
  NexoraProject,
  ProjectFile,
  ProjectType,
  ReferenceAttachment,
} from '../src/types/nexora.ts';

/**
 * Modular Service Contracts (PROMPT 1 -> PROMPT 2 Architecture)
 *
 * These typed interfaces isolate provider adapters, AI coding/game/website engines,
 * workspace storage, and build/artifact services so PROMPT 2 can swap or extend
 * execution engines without rewriting routing, UI, or database persistence.
 */

export interface AIInvokeInput {
  modelId: string;
  systemInstruction: string;
  prompt: string;
  jsonMode?: boolean;
}

export interface AIInvokeOutput {
  text: string;
  providerId: string;
  modelId: string;
}

export interface AIProviderAdapter {
  readonly id: string;
  listRegisteredProviders(): AIProviderConfig[];
  testConnection(providerId: string): Promise<AIProviderConfig>;
  invokeText(input: AIInvokeInput): Promise<AIInvokeOutput>;
}

export interface WorkspaceScaffoldSpec {
  type: ProjectType;
  directories: string[];
  starterFiles: ProjectFile[];
}

export interface ProjectScaffolder {
  supports(type: ProjectType): boolean;
  createScaffoldSpec(input: {
    projectId: string;
    projectName: string;
    type: ProjectType;
    prompt: string;
    gameGenre?: string;
    modelLabel: string;
  }): WorkspaceScaffoldSpec;
}

export interface AICodingEngine {
  generateProject(projectId: string, overrideModelId?: string): Promise<void>;
  applyChatEdit(input: {
    projectId: string;
    message: string;
    activeFilePath?: string;
    selectedModelId?: string;
    smartRouting?: boolean;
  }): Promise<NexoraProject>;
}

export interface AndroidBuildService {
  detectToolchain(): Promise<BuildReport['toolchain']>;
  validateProject(files: ProjectFile[]): DiagnosticItem[];
  compileDebugApk(project: NexoraProject, workspaceDir: string): Promise<BuildReport>;
}

export interface GameEngineService {
  validateGameWorkspace(files: ProjectFile[], dimension: '2d' | '3d'): DiagnosticItem[];
  prepareGameDirectories(workspaceDir: string, dimension: '2d' | '3d'): void;
}

export interface WebsiteEngineService {
  validateWebsiteBundle(files: ProjectFile[]): DiagnosticItem[];
  prepareWebsiteDirectories(workspaceDir: string): void;
}

export interface WorkspaceFileManager {
  syncProjectFilesToDisk(project: NexoraProject): void;
  ensureWorkspaceDirectories(projectId: string, dirs: string[]): void;
  createZipArchive(project: NexoraProject): Promise<{ buffer: Buffer; filename: string }>;
}

export interface BuildArtifactManager {
  getApkPath(project: NexoraProject): string | null;
  removeProjectWorkspace(projectId: string): void;
}

export interface ProjectCreationInput {
  ownerId?: string;
  prompt: string;
  type: ProjectType;
  gameGenre?: string;
  selectedModelId?: string;
  smartRouting: boolean;
  attachments?: ReferenceAttachment[];
}
