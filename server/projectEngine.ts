import { execFile } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import vm from 'node:vm';
import JSZip from 'jszip';
import type {
  BuildReport,
  ChatMessage,
  DiagnosticItem,
  GeneratedGameAsset,
  ModelCategory,
  NexoraProject,
  ProjectEnvVar,
  ProjectFile,
  ProjectType,
} from '../src/types/nexora.ts';
import type {
  AICodingEngine,
  AndroidBuildService,
  BuildArtifactManager,
  GameEngineService,
  ProjectCreationInput,
  ProjectScaffolder,
  WebsiteEngineService,
  WorkspaceFileManager,
  WorkspaceScaffoldSpec,
} from './contracts.ts';
import {
  DEFAULT_USER_ID,
  WORKSPACES_DIR,
  dbAppendProjectHistory,
  dbDeleteProject,
  dbGetProject,
  dbListProjects,
  dbUpsertProject,
  ensureDatabaseDirs,
} from './database.ts';
import { createJob, updateJob } from './jobs.ts';
import {
  getFreeFallbackSuggestions,
  invokeFreeModelText,
  routeFreeModel,
  tryResolveModelForWorkspace,
} from './modelHub.ts';
import { appendProjectVersion } from './versionHistory.ts';

const execFileAsync = promisify(execFile);

export const projectEvents = new EventEmitter();
projectEvents.setMaxListeners(50);

const activeGenerations = new Set<string>();

const VALID_PROJECT_TYPES: ProjectType[] = ['android-apk', 'game-2d', 'game-3d', 'website'];

export function listProjects(ownerId = DEFAULT_USER_ID): NexoraProject[] {
  return dbListProjects(ownerId);
}

export function getProject(id: string, ownerId = DEFAULT_USER_ID): NexoraProject | undefined {
  return dbGetProject(id, ownerId);
}

export const workspaceFileManager: WorkspaceFileManager = {
  syncProjectFilesToDisk(project: NexoraProject) {
    ensureDatabaseDirs();
    const root = path.join(WORKSPACES_DIR, project.id);
    fs.mkdirSync(root, { recursive: true });
    for (const file of project.files) {
      if (file.language === 'binary-ref') continue;
      const safeRel = file.path.replace(/^\/+/, '').replace(/\.\./g, '');
      if (!safeRel) continue;
      const abs = path.join(root, safeRel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, file.content, 'utf8');
    }
  },
  ensureWorkspaceDirectories(projectId: string, dirs: string[]) {
    ensureDatabaseDirs();
    const root = path.join(WORKSPACES_DIR, projectId);
    fs.mkdirSync(root, { recursive: true });
    for (const rel of dirs) {
      const safeRel = rel.replace(/^\/+/, '').replace(/\.\./g, '');
      if (!safeRel) continue;
      fs.mkdirSync(path.join(root, safeRel), { recursive: true });
    }
  },
  async createZipArchive(project: NexoraProject) {
    const zip = new JSZip();
    for (const f of project.files) {
      const cleanPath = f.path.replace(/^\/+/, '');
      if (cleanPath) {
        zip.file(cleanPath, f.content);
      }
    }
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });
    const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || project.id;
    return { buffer, filename: `${slug}-source.zip` };
  },
};

export const buildArtifactManager: BuildArtifactManager = {
  getApkPath(project: NexoraProject): string | null {
    if (!project.build.apkAvailable) return null;
    const apkPath = path.join(
      WORKSPACES_DIR,
      project.id,
      'app/build/outputs/apk/debug/app-debug.apk'
    );
    return fs.existsSync(apkPath) ? apkPath : null;
  },
  removeProjectWorkspace(projectId: string) {
    const dir = path.join(WORKSPACES_DIR, projectId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  },
};

export function writeWorkspaceFilesToDisk(project: NexoraProject) {
  workspaceFileManager.syncProjectFilesToDisk(project);
}

export function upsertProject(project: NexoraProject): NexoraProject {
  const updated = dbUpsertProject(project);
  writeWorkspaceFilesToDisk(updated);
  projectEvents.emit(`project:${updated.id}`, updated);
  return updated;
}

export function renameProject(
  id: string,
  name: string,
  ownerId = DEFAULT_USER_ID
): NexoraProject {
  const project = getProject(id, ownerId);
  if (!project) throw new Error('Project not found.');
  const clean = name.trim();
  if (!clean) throw new Error('Project name cannot be empty.');
  const saved = upsertProject({ ...project, name: clean });
  return dbAppendProjectHistory(saved.id, 'renamed', `Renamed project to "${clean}".`, ownerId) || saved;
}

export function duplicateProject(id: string, ownerId = DEFAULT_USER_ID): NexoraProject {
  const source = getProject(id, ownerId);
  if (!source) throw new Error('Project not found.');
  const now = new Date().toISOString();
  const copyId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const duplicated: NexoraProject = {
    ...source,
    id: copyId,
    ownerId,
    name: `${source.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    history: [
      {
        id: `hist-${Date.now()}`,
        action: 'duplicated',
        detail: `Duplicated from ${source.name} (${source.id}).`,
        timestamp: now,
      },
    ],
    build: {
      ...source.build,
      apkAvailable: false,
      apkFilename: undefined,
      apkSizeBytes: undefined,
    },
  };
  return upsertProject(duplicated);
}

export function saveProjectSnapshot(id: string, ownerId = DEFAULT_USER_ID): NexoraProject {
  const existing = getProject(id, ownerId);
  if (!existing) throw new Error('Project not found.');
  writeWorkspaceFilesToDisk(existing);
  return (
    dbAppendProjectHistory(
      id,
      'workspace_saved',
      `Saved workspace snapshot (${existing.files.length} files).`,
      ownerId
    ) || existing
  );
}

export function deleteProject(id: string, ownerId = DEFAULT_USER_ID): boolean {
  const removed = dbDeleteProject(id, ownerId);
  if (removed) {
    buildArtifactManager.removeProjectWorkspace(id);
  }
  return removed;
}

function categoryForProjectType(type: ProjectType): ModelCategory {
  switch (type) {
    case 'android-apk':
      return 'coding';
    case 'game-2d':
    case 'game-3d':
      return 'game-dev';
    case 'website':
      return 'coding';
  }
}

function deriveProjectName(prompt: string, type: ProjectType): string {
  const cleaned = prompt
    .replace(/^(create|build|make|design|generate)\s+(an?|the)?\s*/i, '')
    .trim();
  const words = cleaned.split(/\s+/).slice(0, 4).join(' ');
  if (words.length >= 3) {
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  const suffix =
    type === 'android-apk'
      ? 'Android App'
      : type === 'game-2d'
      ? '2D Game'
      : type === 'game-3d'
      ? '3D Game'
      : 'Web Project';
  return `Nexora ${suffix}`;
}

export const defaultProjectScaffolder: ProjectScaffolder = {
  supports(type: ProjectType) {
    return VALID_PROJECT_TYPES.includes(type);
  },
  createScaffoldSpec(input) {
    const directories =
      input.type === 'android-apk'
        ? [
            'app/src/main/java/com/nexora/app',
            'app/src/main/res/values',
            'app/src/main/res/drawable',
            'gradle/wrapper',
          ]
        : input.type === 'game-2d' || input.type === 'game-3d'
        ? [
            'app/src/main/java/com/nexora/game',
            'app/src/main/assets/sprites',
            'app/src/main/assets/scenes',
            'src',
          ]
        : ['src', 'public', 'assets'];

    const structureLabel =
      input.type === 'android-apk'
        ? 'Android Kotlin / Jetpack Compose workspace'
        : input.type === 'game-2d'
        ? '2D Interactive Game workspace'
        : input.type === 'game-3d'
        ? '3D Interactive Game workspace'
        : 'Website application workspace';

    const starterFiles: ProjectFile[] = [
      {
        path: 'README.md',
        language: 'markdown',
        content: `# ${input.projectName}\n\n- Project ID: \`${input.projectId}\`\n- Type: ${structureLabel}${
          input.gameGenre ? `\n- Genre: ${input.gameGenre}` : ''
        }\n- Model Route: ${input.modelLabel}\n\n## Prompt\n${input.prompt}\n`,
      },
    ];

    return {
      type: input.type,
      directories,
      starterFiles,
    };
  },
};

export async function createInstantProject(
  input: ProjectCreationInput
): Promise<NexoraProject> {
  if (!input.prompt || input.prompt.trim().length < 3) {
    throw new Error('Please enter a prompt (at least 3 characters) describing what you want to create.');
  }
  if (!VALID_PROJECT_TYPES.includes(input.type)) {
    throw new Error(`Unsupported project type "${String(input.type)}".`);
  }

  const ownerId = input.ownerId || DEFAULT_USER_ID;
  const category = categoryForProjectType(input.type);
  const resolution = tryResolveModelForWorkspace(
    category,
    input.smartRouting ? undefined : input.selectedModelId
  );

  const now = new Date().toISOString();
  const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const toolchain = await detectAndroidToolchain();
  const initialName = deriveProjectName(input.prompt, input.type);

  const modelLabel = resolution.available
    ? `${resolution.provider.name} · ${resolution.model.name}`
    : `${resolution.requestedProviderName} (Unavailable)`;

  const scaffold = defaultProjectScaffolder.createScaffoldSpec({
    projectId,
    projectName: initialName,
    type: input.type,
    prompt: input.prompt.trim(),
    gameGenre: input.gameGenre,
    modelLabel,
  });

  workspaceFileManager.ensureWorkspaceDirectories(projectId, scaffold.directories);

  const previewBanner = resolution.available
    ? `<h3 style="color:#e4e1e9;margin:0 0 8px">Synthesizing ${initialName}</h3><p style="font-size:13px;color:#958ea0;margin:0">Waiting for ${resolution.model.name} (${resolution.provider.name})...</p>`
    : `<h3 style="color:#e4e1e9;margin:0 0 8px">Workspace Ready: ${initialName}</h3><p style="font-size:13px;color:#cbc3d7;margin:0 0 6px">Type: ${input.type}</p><p style="font-size:12px;color:#ffb4ab;margin:0">AI code generation did not start because no valid AI provider connection is active. Connect a provider in AI Models to generate source files.</p>`;

  const project: NexoraProject = {
    id: projectId,
    ownerId,
    name: initialName,
    type: input.type,
    prompt: input.prompt.trim(),
    gameGenre: input.gameGenre,
    attachments: input.attachments || [],
    selectedModelId: resolution.available
      ? resolution.model.id
      : resolution.requestedModelId,
    selectedProviderName: resolution.available
      ? resolution.provider.name
      : resolution.requestedProviderName,
    smartRouting: input.smartRouting,
    generationStatus: resolution.available ? 'queued' : 'awaiting_provider',
    generationStep: resolution.available
      ? `Workspace initialized. Queued generation with ${resolution.provider.name} · ${resolution.model.name}...`
      : 'Workspace initialized. AI generation unavailable until a valid provider is connected.',
    generationProgress: resolution.available ? 10 : 0,
    generationError: resolution.available ? null : resolution.reason,
    fallbackSuggestions: resolution.available ? undefined : resolution.fallbackSuggestions,
    files: scaffold.starterFiles,
    pendingAssets: [],
    previewHtml: `<!doctype html><html><body style="background:#0a0a0f;color:#cbc3d7;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;text-align:center"><div>${previewBanner}</div></body></html>`,
    chat: [
      {
        id: `msg-init-${Date.now()}`,
        role: 'user',
        content: input.prompt.trim(),
        timestamp: now,
      },
    ],
    build: {
      status: 'idle',
      logs: [
        `[${new Date().toLocaleTimeString()}] Workspace ${projectId} initialized (${input.type}).`,
        `[${new Date().toLocaleTimeString()}] Directories prepared: ${scaffold.directories.join(', ')}`,
        resolution.available
          ? `[${new Date().toLocaleTimeString()}] AI Model Route: ${resolution.reason}`
          : `[${new Date().toLocaleTimeString()}] [INFO] AI generation paused: ${resolution.reason}`,
      ],
      diagnostics: [],
      apkAvailable: false,
      toolchain,
      timestamp: now,
    },
    history: [
      {
        id: `hist-${Date.now()}`,
        action: 'workspace_created',
        detail: `Initialized ${input.type} workspace (${projectId}).`,
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  const saved = upsertProject(project);

  if (resolution.available) {
    void runBackgroundProjectGeneration(saved.id);
  }

  return saved;
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first !== -1 && last > first) {
      return JSON.parse(candidate.slice(first, last + 1)) as Record<string, unknown>;
    }
    throw new Error('Model returned non-JSON payload. Try switching to another connected model.');
  }
}

export async function runBackgroundProjectGeneration(
  projectId: string,
  overrideModelId?: string
): Promise<void> {
  if (activeGenerations.has(projectId)) return;
  activeGenerations.add(projectId);

  const job = createJob({
    ownerId: dbGetProject(projectId)?.ownerId || DEFAULT_USER_ID,
    projectId,
    projectName: dbGetProject(projectId)?.name,
    type: 'ai_generate',
    step: 'Queued AI project generation',
  });

  try {
    let project = dbGetProject(projectId);
    if (!project) return;

    const category = categoryForProjectType(project.type);
    const routed = routeFreeModel(
      category,
      overrideModelId || (project.smartRouting ? undefined : project.selectedModelId)
    );

    updateJob(job.id, {
      status: 'running',
      progress: 25,
      step: `Generating with ${routed.provider.name} (${routed.model.name})`,
      appendLog: `Selected ${routed.provider.name} · ${routed.model.name}`,
    });

    project = upsertProject({
      ...project,
      selectedModelId: routed.model.id,
      selectedProviderName: routed.provider.name,
      generationStatus: 'generating',
      generationStep: `Verifying ${routed.provider.name} (${routed.model.name}) and preparing prompt...`,
      generationProgress: 25,
      generationError: null,
      fallbackSuggestions: undefined,
    });

    const attachmentNotes =
      project.attachments && project.attachments.length > 0
        ? `\n\nATTACHED REFERENCE FILES:\n${project.attachments
            .map(
              (a) =>
                `- ${a.name} (${a.mimeType}, ${a.size} bytes):\n${a.contentPreview.slice(
                  0,
                  1400
                )}`
            )
            .join('\n')}`
        : '';

    const typeInstructions =
      project.type === 'android-apk'
        ? `Generate a complete Android Kotlin + Jetpack Compose Gradle project.
Include at minimum:
1. settings.gradle.kts
2. build.gradle.kts
3. app/build.gradle.kts (compileSdk = 35, minSdk = 24, targetSdk = 35, Jetpack Compose & Material3)
4. app/src/main/AndroidManifest.xml (valid XML with package/application/MainActivity launcher intent-filter)
5. app/src/main/java/com/nexora/app/MainActivity.kt (complete functional Kotlin Compose UI)
6. app/src/main/java/com/nexora/app/ui/theme/Theme.kt
7. app/src/main/res/values/strings.xml
8. app/src/main/res/values/themes.xml
9. app/src/main/res/drawable/ic_launcher_foreground.xml
Also generate "previewHtml": a complete self-contained interactive HTML/CSS/JS mobile screen matching the requested app UI.`
        : project.type === 'game-2d' || project.type === 'game-3d'
        ? `Generate a complete ${
            project.type === 'game-3d' ? '3D' : '2D'
          } Android-ready interactive game project (Genre: ${project.gameGenre || 'Custom'}).
Include:
1. settings.gradle.kts, build.gradle.kts, app/build.gradle.kts, app/src/main/AndroidManifest.xml, app/src/main/java/com/nexora/game/MainActivity.kt
2. app/src/main/assets/index.html (full playable offline HTML5 Canvas game with keyboard + touch controls, HUD, physics/collision/AI loop, Web Audio SFX, pause/restart, localStorage high-score save)
3. "pendingAssets": 2-3 custom SVG game assets ({ "id", "name", "kind": "sprite"|"texture"|"tileset"|"ui-icon", "svgMarkup": "<svg ...>...</svg>", "targetPath": "app/src/main/assets/sprites/..." })
4. "previewHtml": complete self-contained playable HTML game document.`
        : `Generate a complete full-stack Website project with Node.js HTTP backend + persistent JSON DB + responsive frontend.
Include:
1. package.json (with "type": "module", "scripts": { "start": "node server.js" })
2. server.js (using ONLY Node built-in 'node:http', 'node:fs', 'node:path', 'node:url' so it starts immediately without npm install; serves public/index.html + real REST API routes under /api/* backed by db/store.json)
3. public/index.html (frontend fetching relative 'api/...' endpoints, interactive forms, dark/modern responsive UI)
4. db/store.json (seed data JSON)
5. "previewHtml": complete self-contained HTML preview of the frontend.`;

    const systemInstruction = `You are Nexora Studio's Senior Software & Game Architect.
Return ONLY valid JSON matching this schema:
{
  "projectName": "Short project name",
  "summary": "2-3 sentence summary of generated architecture",
  "files": [
    { "path": "relative/path.ext", "language": "kotlin|xml|gradle|html|css|javascript|json", "content": "complete source code" }
  ],
  "pendingAssets": [
    { "id": "asset-1", "name": "Asset Name", "kind": "sprite|texture|tileset|ui-icon", "svgMarkup": "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'>...</svg>", "targetPath": "app/src/main/assets/sprites/asset.svg" }
  ],
  "previewHtml": "<!doctype html><html>...</html>"
}`;

    const fullPrompt = `Project Type: ${project.type}${
      project.gameGenre ? `\nGame Genre: ${project.gameGenre}` : ''
    }\nUser Request: ${project.prompt}${attachmentNotes}\n\n${typeInstructions}`;

    project = upsertProject({
      ...project,
      generationStep: `Generating files with ${routed.provider.name} · ${routed.model.name}...`,
      generationProgress: 50,
    });

    const aiResult = await invokeFreeModelText({
      modelId: routed.model.id,
      systemInstruction,
      prompt: fullPrompt,
      jsonMode: true,
    });

    project = upsertProject({
      ...project,
      generationStep: 'Parsing generated code & validating project structure...',
      generationProgress: 80,
    });

    const parsed = extractJsonObject(aiResult.text);
    const rawFiles = Array.isArray(parsed.files) ? parsed.files : [];
    const files: ProjectFile[] = rawFiles
      .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
      .map((f) => ({
        path: String(f.path || 'README.md'),
        language: String(f.language || 'text'),
        content: String(f.content || ''),
      }));

    if (files.length === 0) {
      throw new Error('Model returned 0 project files.');
    }

    const rawAssets = Array.isArray(parsed.pendingAssets) ? parsed.pendingAssets : [];
    const pendingAssets: GeneratedGameAsset[] = rawAssets
      .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === 'object'))
      .map((a, idx) => ({
        id: String(a.id || `asset-${idx + 1}`),
        name: String(a.name || `Generated Asset ${idx + 1}`),
        kind: (['sprite', 'texture', 'tileset', 'ui-icon'].includes(String(a.kind))
          ? String(a.kind)
          : 'sprite') as GeneratedGameAsset['kind'],
        svgMarkup: String(a.svgMarkup || ''),
        targetPath: String(a.targetPath || `app/src/main/assets/sprites/asset-${idx + 1}.svg`),
        approved: false,
      }));

    const projectName = String(parsed.projectName || project.name);
    const previewHtml =
      typeof parsed.previewHtml === 'string' && parsed.previewHtml.trim()
        ? parsed.previewHtml
        : files.find((f) => f.path.endsWith('index.html'))?.content || project.previewHtml;

    const diagnostics = validateProjectStructure(files, project.type);
    const assistantMsg: ChatMessage = {
      id: `msg-gen-${Date.now()}`,
      role: 'assistant',
      content: `${String(parsed.summary || 'Project generated.')}\n\n${routed.reason}`,
      modelUsed: `${routed.provider.name} · ${routed.model.name}`,
      modifiedFiles: files.map((f) => f.path),
      timestamp: new Date().toISOString(),
    };

    const latest = dbGetProject(projectId) || project;
    const withVersion = appendProjectVersion(
      {
        ...latest,
        name: projectName,
        files,
        pendingAssets,
        previewHtml,
        generationStatus: 'completed',
        generationStep: `Completed (${files.length} files generated)`,
        generationProgress: 100,
        generationError: null,
        chat: [...latest.chat, assistantMsg],
        build: {
          ...latest.build,
          diagnostics,
          logs: [
            ...latest.build.logs,
            `[${new Date().toLocaleTimeString()}] Generated ${files.length} files via ${
              routed.provider.name
            } (${routed.model.name}).`,
          ],
        },
      },
      'Initial AI Generation',
      'ai-edit',
      `Generated ${files.length} files with ${routed.model.name}`
    );
    upsertProject(withVersion);
    updateJob(job.id, {
      status: 'completed',
      progress: 100,
      step: `Completed (${files.length} files generated)`,
      appendLog: `Saved ${files.length} files to project workspace.`,
    });
    dbAppendProjectHistory(
      projectId,
      'ai_generation_completed',
      `Generated ${files.length} files with ${routed.provider.name} (${routed.model.name}).`,
      latest.ownerId || DEFAULT_USER_ID
    );
  } catch (err) {
    const latest = dbGetProject(projectId);
    const errMsg = err instanceof Error ? err.message : String(err);
    updateJob(job.id, {
      status: 'failed',
      step: 'AI generation failed',
      error: errMsg,
      appendLog: `[ERROR] ${errMsg}`,
    });
    if (latest) {
      const category = categoryForProjectType(latest.type);
      const fallbacks = getFreeFallbackSuggestions(category, latest.selectedModelId);

      upsertProject({
        ...latest,
        generationStatus: 'error',
        generationStep: 'Generation failed — provider unavailable or returned an error',
        generationProgress: latest.generationProgress > 0 ? latest.generationProgress : 25,
        generationError: errMsg,
        fallbackSuggestions: fallbacks,
        build: {
          ...latest.build,
          logs: [
            ...latest.build.logs,
            `[${new Date().toLocaleTimeString()}] [ERROR] ${errMsg}`,
          ],
          diagnostics: [
            ...latest.build.diagnostics,
            { severity: 'error', file: 'AI Generation', message: errMsg },
          ],
        },
      });
    }
  } finally {
    activeGenerations.delete(projectId);
  }
}

export async function chatWithProject(input: {
  projectId: string;
  ownerId?: string;
  message: string;
  activeFilePath?: string;
  selectedModelId?: string;
  smartRouting?: boolean;
}): Promise<NexoraProject> {
  const project = getProject(input.projectId, input.ownerId || DEFAULT_USER_ID);
  if (!project) throw new Error('Project not found.');

  const lower = input.message.toLowerCase();
  const category: ModelCategory =
    lower.includes('fix') || lower.includes('error') || lower.includes('bug')
      ? 'reasoning'
      : project.type === 'game-2d' || project.type === 'game-3d'
      ? 'game-dev'
      : 'coding';

  const useSmart = input.smartRouting ?? project.smartRouting;
  const routed = routeFreeModel(
    category,
    useSmart ? undefined : input.selectedModelId || project.selectedModelId
  );

  const fileContext = project.files
    .slice(0, 12)
    .map(
      (f) =>
        `FILE: ${f.path}${f.path === input.activeFilePath ? ' (CURRENTLY OPEN)' : ''}\n${f.content.slice(
          0,
          2800
        )}`
    )
    .join('\n\n---\n\n');

  const systemInstruction = `You are Nexora Studio's AI Development Assistant editing an existing ${project.type} project.
Return ONLY valid JSON:
{
  "reply": "Clear technical explanation of changes made",
  "updatedFiles": [
    { "path": "exact/or/new/path.ext", "language": "kotlin|xml|gradle|html|css|javascript|json", "content": "complete updated file content" }
  ],
  "previewHtml": "optional updated complete HTML preview if UI or game changed, otherwise null"
}`;

  const prompt = `Project Name: ${project.name}
User Request: ${input.message}

Current Project Files:
${fileContext}`;

  const aiResult = await invokeFreeModelText({
    modelId: routed.model.id,
    systemInstruction,
    prompt,
    jsonMode: true,
  });

  const parsed = extractJsonObject(aiResult.text);
  const rawUpdates = Array.isArray(parsed.updatedFiles) ? parsed.updatedFiles : [];
  const nextFiles = [...project.files];
  const modifiedPaths: string[] = [];

  for (const item of rawUpdates) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const filePath = String(obj.path || '').trim();
    if (!filePath) continue;
    const fileContent = String(obj.content ?? '');
    const language = String(obj.language || 'text');
    const existingIdx = nextFiles.findIndex((f) => f.path === filePath);
    if (existingIdx >= 0) {
      nextFiles[existingIdx] = { path: filePath, language, content: fileContent };
    } else {
      nextFiles.push({ path: filePath, language, content: fileContent });
    }
    modifiedPaths.push(filePath);
  }

  const now = new Date().toISOString();
  const userMsg: ChatMessage = {
    id: `msg-u-${Date.now()}`,
    role: 'user',
    content: input.message,
    timestamp: now,
  };
  const assistantMsg: ChatMessage = {
    id: `msg-a-${Date.now() + 1}`,
    role: 'assistant',
    content: `${String(parsed.reply || 'Updated project files.')}\n\n(${routed.reason})`,
    modelUsed: `${routed.provider.name} · ${routed.model.name}`,
    modifiedFiles: modifiedPaths,
    timestamp: now,
  };

  const nextPreview =
    typeof parsed.previewHtml === 'string' && parsed.previewHtml.trim()
      ? parsed.previewHtml
      : modifiedPaths.some((p) => p.endsWith('index.html'))
      ? nextFiles.find((f) => f.path.endsWith('index.html'))?.content || project.previewHtml
      : project.previewHtml;

  // Automatically save checkpoint BEFORE applying major AI edit
  const checkpointed = appendProjectVersion(
    project,
    `Before AI Edit (${new Date().toLocaleTimeString()})`,
    'checkpoint',
    `Prompt: ${input.message.slice(0, 72)}`
  );

  const updatedProject: NexoraProject = {
    ...checkpointed,
    files: nextFiles,
    previewHtml: nextPreview,
    chat: [...checkpointed.chat, userMsg, assistantMsg],
    build: {
      ...checkpointed.build,
      diagnostics: validateProjectStructure(nextFiles, checkpointed.type),
    },
  };

  return upsertProject(updatedProject);
}

export const defaultAICodingEngine: AICodingEngine = {
  generateProject: runBackgroundProjectGeneration,
  applyChatEdit: chatWithProject,
};

export async function detectAndroidToolchain(): Promise<BuildReport['toolchain']> {
  const checkCmd = async (cmd: string) => {
    try {
      await execFileAsync('which', [cmd], { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  };
  const [java, gradle] = await Promise.all([checkCmd('java'), checkCmd('gradle')]);
  const androidSdk = Boolean(
    (process.env.ANDROID_HOME && fs.existsSync(process.env.ANDROID_HOME)) ||
      (process.env.ANDROID_SDK_ROOT && fs.existsSync(process.env.ANDROID_SDK_ROOT))
  );
  const remoteRunner = Boolean(process.env.ANDROID_BUILD_SERVICE_URL?.trim());
  return { java, gradle, androidSdk, remoteRunner };
}

export const defaultWebsiteEngineService: WebsiteEngineService = {
  validateWebsiteBundle(files: ProjectFile[]): DiagnosticItem[] {
    const diagnostics: DiagnosticItem[] = [];
    const html = files.find((f) => f.path === 'index.html' || f.path.endsWith('/index.html'));
    if (!html) {
      diagnostics.push({
        severity: 'error',
        file: 'index.html',
        message: 'Missing root or public/index.html entry file.',
      });
    } else if (!html.content.toLowerCase().includes('<html')) {
      diagnostics.push({
        severity: 'warning',
        file: html.path,
        message: 'index.html is missing a root <html> element.',
      });
    }

    for (const file of files) {
      if (file.path.endsWith('.json')) {
        try {
          JSON.parse(file.content);
        } catch (err) {
          diagnostics.push({
            severity: 'error',
            file: file.path,
            message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
      if (file.path.endsWith('.js') || file.path.endsWith('.mjs')) {
        try {
          const parsable = file.content
            .replace(/^\s*import\s+.*?;?\s*$/gm, '// import')
            .replace(/^\s*export\s+(default\s+)?/gm, '')
            .replace(/\bimport\.meta\b/g, '({ url: "" })');
          new vm.Script(parsable, { filename: file.path });
        } catch (err) {
          diagnostics.push({
            severity: 'error',
            file: file.path,
            message: `JavaScript syntax error: ${err instanceof Error ? err.message : String(err)}`,
          });
        }
      }
    }
    return diagnostics;
  },
  prepareWebsiteDirectories(workspaceDir: string) {
    for (const dir of ['src', 'public', 'assets']) {
      fs.mkdirSync(path.join(workspaceDir, dir), { recursive: true });
    }
  },
};

export const defaultGameEngineService: GameEngineService = {
  validateGameWorkspace(files: ProjectFile[]): DiagnosticItem[] {
    return validateAndroidFiles(files);
  },
  prepareGameDirectories(workspaceDir: string) {
    for (const dir of ['app/src/main/assets/sprites', 'app/src/main/assets/scenes', 'src']) {
      fs.mkdirSync(path.join(workspaceDir, dir), { recursive: true });
    }
  },
};

function validateAndroidFiles(files: ProjectFile[]): DiagnosticItem[] {
  const diagnostics: DiagnosticItem[] = [];
  const manifest = files.find((f) => f.path.endsWith('AndroidManifest.xml'));
  if (!manifest) {
    diagnostics.push({
      severity: 'error',
      file: 'app/src/main/AndroidManifest.xml',
      message: 'AndroidManifest.xml is missing; required for APK packaging.',
    });
  } else {
    if (!manifest.content.includes('<manifest')) {
      diagnostics.push({
        severity: 'error',
        file: manifest.path,
        message: 'Missing <manifest> root declaration.',
      });
    }
    if (!manifest.content.includes('<application')) {
      diagnostics.push({
        severity: 'error',
        file: manifest.path,
        message: 'Missing <application> declaration.',
      });
    }
    if (!manifest.content.includes('android.intent.action.MAIN')) {
      diagnostics.push({
        severity: 'warning',
        file: manifest.path,
        message: 'No launcher MAIN activity intent-filter detected.',
      });
    }
  }

  const appGradle = files.find(
    (f) => f.path.endsWith('app/build.gradle.kts') || f.path.endsWith('app/build.gradle')
  );
  if (!appGradle) {
    diagnostics.push({
      severity: 'error',
      file: 'app/build.gradle.kts',
      message: 'Missing module Gradle build script (app/build.gradle.kts).',
    });
  } else {
    if (!appGradle.content.includes('compileSdk')) {
      diagnostics.push({
        severity: 'warning',
        file: appGradle.path,
        message: 'compileSdk is not explicitly configured in module Gradle script.',
      });
    }
    if (!appGradle.content.includes('applicationId')) {
      diagnostics.push({
        severity: 'error',
        file: appGradle.path,
        message: 'applicationId is missing in defaultConfig.',
      });
    }
  }

  for (const f of files) {
    if (f.path.endsWith('.kt') || f.path.endsWith('.java')) {
      const open = (f.content.match(/\{/g) || []).length;
      const close = (f.content.match(/\}/g) || []).length;
      if (open !== close) {
        diagnostics.push({
          severity: 'error',
          file: f.path,
          message: `Unbalanced braces detected (${open} opening, ${close} closing).`,
        });
      }
    }
  }

  if (diagnostics.length === 0) {
    diagnostics.push({
      severity: 'info',
      file: 'Gradle & Manifest Validator',
      message: `Validated ${files.length} source and resource files with 0 structural errors.`,
    });
  }
  return diagnostics;
}

export function validateProjectStructure(
  files: ProjectFile[],
  type: ProjectType
): DiagnosticItem[] {
  if (type === 'website') {
    return defaultWebsiteEngineService.validateWebsiteBundle(files);
  }
  if (type === 'game-2d' || type === 'game-3d') {
    return defaultGameEngineService.validateGameWorkspace(files, type === 'game-3d' ? '3d' : '2d');
  }
  return validateAndroidFiles(files);
}

export const defaultAndroidBuildService: AndroidBuildService = {
  detectToolchain: detectAndroidToolchain,
  validateProject: validateAndroidFiles,
  async compileDebugApk(project: NexoraProject, workspaceDir: string): Promise<BuildReport> {
    const logs: string[] = [];
    const stamp = () => new Date().toLocaleTimeString();
    logs.push(`[${stamp()}] Starting server-side validation for "${project.name}" (${project.type})...`);
    const diagnostics = validateProjectStructure(project.files, project.type);
    const hasBlockingErrors = diagnostics.some((d) => d.severity === 'error');

    for (const d of diagnostics) {
      logs.push(`[${d.severity.toUpperCase()}] ${d.file}: ${d.message}`);
    }

    const toolchain = await detectAndroidToolchain();
    logs.push(
      `[${stamp()}] Host toolchain probe -> JDK: ${toolchain.java ? 'found' : 'missing'} | Gradle: ${
        toolchain.gradle ? 'found' : 'missing'
      } | Android SDK: ${toolchain.androidSdk ? 'found' : 'missing'} | Remote Build Service: ${
        toolchain.remoteRunner ? 'configured' : 'not configured'
      }`
    );

    if (hasBlockingErrors) {
      return {
        status: 'failed',
        logs: [...logs, `[${stamp()}] Build aborted due to project validation errors.`],
        diagnostics,
        apkAvailable: false,
        toolchain,
        timestamp: new Date().toISOString(),
      };
    }

    if (toolchain.java && toolchain.gradle && toolchain.androidSdk) {
      try {
        logs.push(`[${stamp()}] Executing: gradle assembleDebug --no-daemon`);
        const { stdout, stderr } = await execFileAsync('gradle', ['assembleDebug', '--no-daemon'], {
          cwd: workspaceDir,
          timeout: 180000,
        });
        if (stdout) logs.push(...stdout.split('\n').filter(Boolean).slice(-40));
        if (stderr) logs.push(...stderr.split('\n').filter(Boolean).slice(-20));

        const apkPath = path.join(workspaceDir, 'app/build/outputs/apk/debug/app-debug.apk');
        if (fs.existsSync(apkPath)) {
          const stat = fs.statSync(apkPath);
          logs.push(`[${stamp()}] APK artifact produced: app-debug.apk (${stat.size} bytes).`);
          return {
            status: 'success',
            logs,
            diagnostics,
            apkAvailable: true,
            apkFilename: `${project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-debug.apk`,
            apkSizeBytes: stat.size,
            toolchain,
            timestamp: new Date().toISOString(),
          };
        }
        return {
          status: 'failed',
          logs: [...logs, `[${stamp()}] Gradle completed without producing app-debug.apk.`],
          diagnostics,
          apkAvailable: false,
          toolchain,
          timestamp: new Date().toISOString(),
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          status: 'failed',
          logs: [...logs, `[${stamp()}] Gradle build failed: ${msg}`],
          diagnostics: [...diagnostics, { severity: 'error', file: 'Gradle Build', message: msg }],
          apkAvailable: false,
          toolchain,
          timestamp: new Date().toISOString(),
        };
      }
    }

    const missingParts: string[] = [];
    if (!toolchain.java) missingParts.push('JDK (java/javac)');
    if (!toolchain.gradle) missingParts.push('Gradle CLI');
    if (!toolchain.androidSdk) missingParts.push('Android SDK (ANDROID_HOME / ANDROID_SDK_ROOT)');
    if (!toolchain.remoteRunner) missingParts.push('ANDROID_BUILD_SERVICE_URL');

    logs.push(
      `[${stamp()}] APK compilation halted: missing ${missingParts.join(', ')} in this runtime container.`
    );
    logs.push(
      `[${stamp()}] Export the complete Android source project (.zip) to compile in Android Studio or CI.`
    );

    return {
      status: 'toolchain_unavailable',
      logs,
      diagnostics: [
        ...diagnostics,
        {
          severity: 'warning',
          file: 'Build Environment',
          message: `Cannot compile binary APK in this container: missing ${missingParts.join(
            ', '
          )}. Export source ZIP to build locally or configure ANDROID_BUILD_SERVICE_URL.`,
        },
      ],
      apkAvailable: false,
      toolchain,
      timestamp: new Date().toISOString(),
    };
  },
};

export async function runProjectBuild(
  projectId: string,
  ownerId = DEFAULT_USER_ID
): Promise<NexoraProject> {
  const project = getProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');

  writeWorkspaceFilesToDisk(project);
  const workspaceDir = path.join(WORKSPACES_DIR, project.id);

  if (project.type === 'website') {
    const stamp = () => new Date().toLocaleTimeString();
    const diagnostics = validateProjectStructure(project.files, 'website');
    const hasBlockingErrors = diagnostics.some((d) => d.severity === 'error');
    const toolchain = await detectAndroidToolchain();
    return upsertProject({
      ...project,
      build: {
        status: hasBlockingErrors ? 'failed' : 'success',
        logs: [
          `[${stamp()}] Validating website bundle "${project.name}" (${project.files.length} files)...`,
          ...diagnostics.map((d) => `[${d.severity.toUpperCase()}] ${d.file}: ${d.message}`),
          hasBlockingErrors
            ? `[${stamp()}] Validation failed.`
            : `[${stamp()}] Website bundle verified on disk. Preview and ZIP export ready.`,
        ],
        diagnostics,
        apkAvailable: false,
        toolchain,
        timestamp: new Date().toISOString(),
      },
    });
  }

  const report = await defaultAndroidBuildService.compileDebugApk(project, workspaceDir);
  return upsertProject({
    ...project,
    build: report,
  });
}

export function getRealApkPath(projectId: string, ownerId = DEFAULT_USER_ID): string | null {
  const project = getProject(projectId, ownerId);
  if (!project) return null;
  return buildArtifactManager.getApkPath(project);
}

export async function createProjectZipBuffer(
  projectId: string,
  ownerId = DEFAULT_USER_ID
): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const project = getProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  return workspaceFileManager.createZipArchive(project);
}

export async function createAssetsZipBuffer(
  projectId: string,
  ownerId = DEFAULT_USER_ID
): Promise<{ buffer: Buffer; filename: string }> {
  const project = getProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  const zip = new JSZip();
  let count = 0;
  for (const f of project.files) {
    if (/\.(svg|png|jpg|jpeg|webp|mp3|wav|ogg|woff2)$/i.test(f.path) || f.path.includes('/assets/')) {
      zip.file(f.path.replace(/^\/+/, ''), f.content);
      count++;
    }
  }
  for (const a of project.pendingAssets) {
    if (a.approved && a.svgMarkup) {
      zip.file(a.targetPath.replace(/^\/+/, ''), a.svgMarkup);
      count++;
    }
  }
  if (count === 0) {
    zip.file('ASSETS_README.txt', `No approved asset files currently stored in ${project.name}.`);
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || project.id;
  return { buffer, filename: `${slug}-assets.zip` };
}

export function deleteProjectFile(
  projectId: string,
  filePath: string,
  ownerId = DEFAULT_USER_ID
): NexoraProject {
  const project = getProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  const nextFiles = project.files.filter((f) => f.path !== filePath);
  if (nextFiles.length === project.files.length) {
    throw new Error(`File "${filePath}" not found.`);
  }
  const diskPath = path.join(WORKSPACES_DIR, project.id, filePath.replace(/^\/+/, '').replace(/\.\./g, ''));
  if (fs.existsSync(diskPath)) {
    fs.rmSync(diskPath, { force: true });
  }
  return upsertProject({
    ...project,
    files: nextFiles,
    build: {
      ...project.build,
      diagnostics: validateProjectStructure(nextFiles, project.type),
    },
  });
}

export function renameProjectFile(
  projectId: string,
  oldPath: string,
  newPath: string,
  ownerId = DEFAULT_USER_ID
): NexoraProject {
  const project = getProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  const cleanNew = newPath.trim().replace(/^\/+/, '').replace(/\.\./g, '');
  if (!cleanNew) throw new Error('Invalid target file path.');
  if (project.files.some((f) => f.path === cleanNew)) {
    throw new Error(`File "${cleanNew}" already exists.`);
  }
  const target = project.files.find((f) => f.path === oldPath);
  if (!target) throw new Error(`File "${oldPath}" not found.`);

  const nextFiles = project.files.map((f) =>
    f.path === oldPath ? { ...f, path: cleanNew } : f
  );
  const oldDisk = path.join(WORKSPACES_DIR, project.id, oldPath.replace(/^\/+/, '').replace(/\.\./g, ''));
  if (fs.existsSync(oldDisk)) fs.rmSync(oldDisk, { force: true });

  return upsertProject({
    ...project,
    files: nextFiles,
    build: {
      ...project.build,
      diagnostics: validateProjectStructure(nextFiles, project.type),
    },
  });
}

export function updateProjectEnvVars(
  projectId: string,
  envVars: ProjectEnvVar[],
  ownerId = DEFAULT_USER_ID
): NexoraProject {
  const project = getProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  const sanitized = envVars
    .map((e) => ({ key: e.key.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'), value: String(e.value ?? '') }))
    .filter((e) => e.key.length > 0);
  return upsertProject({
    ...project,
    envVars: sanitized,
  });
}

export function addUploadedAsset(
  projectId: string,
  asset: Omit<GeneratedGameAsset, 'id' | 'approved' | 'source'>,
  ownerId = DEFAULT_USER_ID
): NexoraProject {
  const project = getProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  const newAsset: GeneratedGameAsset = {
    ...asset,
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    approved: false,
    source: 'upload',
  };
  return upsertProject({
    ...project,
    pendingAssets: [newAsset, ...project.pendingAssets],
  });
}

export function removePendingAsset(
  projectId: string,
  assetId: string,
  ownerId = DEFAULT_USER_ID
): NexoraProject {
  const project = getProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  return upsertProject({
    ...project,
    pendingAssets: project.pendingAssets.filter((a) => a.id !== assetId),
  });
}
