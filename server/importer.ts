import path from 'node:path';
import JSZip from 'jszip';
import type { NexoraProject, ProjectFile, ProjectType } from '../src/types/nexora.ts';
import { DEFAULT_USER_ID } from './database.ts';
import { detectAndroidToolchain, upsertProject, validateProjectStructure, workspaceFileManager } from './projectEngine.ts';
import { appendProjectVersion } from './versionHistory.ts';

const MAX_ZIP_BYTES = 12 * 1024 * 1024;
const MAX_FILES = 160;
const TEXT_EXTENSIONS = new Set([
  '.html', '.htm', '.css', '.scss', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.json', '.md', '.txt', '.xml', '.kt', '.kts', '.java', '.gradle', '.yml', '.yaml',
  '.svg', '.env', '.gitignore', '.sql', '.sh',
]);

function inferLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.kt' || ext === '.kts') return 'kotlin';
  if (ext === '.xml' || ext === '.svg') return 'xml';
  if (ext === '.gradle') return 'gradle';
  if (ext === '.html' || ext === '.htm') return 'html';
  if (ext === '.css' || ext === '.scss') return 'css';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.json') return 'json';
  if (ext === '.md') return 'markdown';
  return 'text';
}

function sanitizeZipEntryPath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.endsWith('/')) return null;
  if (normalized.includes('..')) return null;
  if (normalized.startsWith('node_modules/') || normalized.startsWith('.git/') || normalized.startsWith('build/')) {
    return null;
  }
  return normalized;
}

export function inspectImportedFiles(files: ProjectFile[]): {
  type: ProjectType;
  detectedFramework: string;
  dependencies: string[];
  warnings: string[];
} {
  const paths = files.map((f) => f.path);
  const warnings: string[] = [];
  const dependencies: string[] = [];

  const hasAndroidManifest = paths.some((p) => p.endsWith('AndroidManifest.xml'));
  const hasGradle = paths.some((p) => p.endsWith('build.gradle') || p.endsWith('build.gradle.kts'));
  const hasPkgJson = files.find((f) => f.path === 'package.json');
  const hasHtml = paths.some((p) => p.endsWith('index.html'));

  let detectedFramework = 'Static Web / Custom Source';
  let type: ProjectType = 'website';

  if (hasAndroidManifest || hasGradle) {
    type = 'android-apk';
    detectedFramework = paths.some((p) => p.endsWith('.kt'))
      ? 'Android Kotlin / Gradle'
      : 'Android Java / Gradle';
    if (!hasAndroidManifest) warnings.push('Missing AndroidManifest.xml');
    if (!hasGradle) warnings.push('Missing build.gradle / build.gradle.kts');
  } else if (hasPkgJson) {
    try {
      const pkg = JSON.parse(hasPkgJson.content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = Object.keys(pkg.dependencies || {});
      dependencies.push(...deps.slice(0, 20));
      if (deps.includes('express')) detectedFramework = 'Node.js / Express Full-Stack';
      else if (deps.includes('react')) detectedFramework = 'React Web App';
      else detectedFramework = 'Node.js Project';
    } catch {
      warnings.push('package.json contains invalid JSON.');
    }
  } else if (hasHtml) {
    const htmlContent = files.find((f) => f.path.endsWith('index.html'))?.content || '';
    if (htmlContent.includes('<canvas')) {
      type = 'game-2d';
      detectedFramework = 'HTML5 Canvas App / Game';
    } else {
      detectedFramework = 'Static HTML/CSS/JS Website';
    }
  } else {
    warnings.push('No index.html, package.json, or AndroidManifest.xml entrypoint detected.');
  }

  return { type, detectedFramework, dependencies, warnings };
}

export async function importProjectFromZipBase64(input: {
  zipBase64: string;
  projectName?: string;
  ownerId?: string;
}): Promise<NexoraProject> {
  const cleanBase64 = input.zipBase64.replace(/^data:[^;]+;base64,/, '').trim();
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (buffer.length === 0) {
    throw new Error('Uploaded ZIP archive is empty.');
  }
  if (buffer.length > MAX_ZIP_BYTES) {
    throw new Error(`ZIP archive exceeds maximum allowed size (${MAX_ZIP_BYTES / 1024 / 1024} MB).`);
  }

  const zip = await JSZip.loadAsync(buffer);
  const rawEntries = Object.entries(zip.files).filter(([, entry]) => !entry.dir);

  // Strip common top-level wrapper folder (e.g. "my-repo-main/src/index.html" -> "src/index.html")
  const allCleanPaths = rawEntries
    .map(([name]) => sanitizeZipEntryPath(name))
    .filter((p): p is string => Boolean(p));

  let commonPrefix = '';
  if (allCleanPaths.length > 0 && allCleanPaths[0].includes('/')) {
    const firstRoot = allCleanPaths[0].split('/')[0] + '/';
    if (allCleanPaths.every((p) => p.startsWith(firstRoot))) {
      commonPrefix = firstRoot;
    }
  }

  const files: ProjectFile[] = [];
  for (const [entryName, entry] of rawEntries) {
    if (files.length >= MAX_FILES) break;
    const sanitized = sanitizeZipEntryPath(entryName);
    if (!sanitized) continue;
    const relPath = commonPrefix ? sanitized.slice(commonPrefix.length) : sanitized;
    if (!relPath) continue;

    const ext = path.extname(relPath).toLowerCase();
    if (TEXT_EXTENSIONS.has(ext) || path.basename(relPath).startsWith('.env')) {
      const content = await entry.async('string');
      files.push({
        path: relPath,
        language: inferLanguage(relPath),
        content: content.slice(0, 250_000),
      });
    } else {
      const bytes = await entry.async('nodebuffer');
      files.push({
        path: relPath,
        language: 'binary-ref',
        content: `[Binary asset imported: ${relPath} (${bytes.length} bytes)]`,
      });
    }
  }

  if (files.length === 0) {
    throw new Error('No supported source files found inside the ZIP archive.');
  }

  const inspection = inspectImportedFiles(files);
  const ownerId = input.ownerId || DEFAULT_USER_ID;
  const projectId = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const toolchain = await detectAndroidToolchain();
  const name = input.projectName?.trim() || commonPrefix.replace(/\/$/, '') || 'Imported Workspace';
  const indexHtml = files.find((f) => f.path === 'index.html' || f.path.endsWith('/index.html'))?.content;
  const diagnostics = validateProjectStructure(files, inspection.type);

  workspaceFileManager.ensureWorkspaceDirectories(projectId, ['src']);

  let project: NexoraProject = {
    id: projectId,
    ownerId,
    name,
    type: inspection.type,
    prompt: `Imported ${inspection.detectedFramework} project (${files.length} files).`,
    selectedModelId: 'zip-import',
    selectedProviderName: 'Imported Archive',
    smartRouting: true,
    generationStatus: 'completed',
    generationStep: `Imported ${files.length} files (${inspection.detectedFramework})`,
    generationProgress: 100,
    generationError: null,
    files,
    pendingAssets: [],
    previewHtml:
      indexHtml ||
      `<!doctype html><html><body style="background:#0a0a0f;color:#cbc3d7;font-family:system-ui;padding:24px"><h3>${name}</h3><p>Detected Framework: ${inspection.detectedFramework}</p><p>Files imported: ${files.length}</p></body></html>`,
    chat: [
      {
        id: `msg-imp-${Date.now()}`,
        role: 'assistant',
        content: `Imported **${name}** safely without executing untrusted startup scripts.\n- Framework: ${inspection.detectedFramework}\n- Files: ${files.length}${
          inspection.warnings.length > 0 ? `\n- Warnings: ${inspection.warnings.join('; ')}` : ''
        }`,
        modifiedFiles: files.slice(0, 20).map((f) => f.path),
        timestamp: now,
      },
    ],
    build: {
      status: 'idle',
      logs: [
        `[${new Date().toLocaleTimeString()}] Imported ZIP archive (${files.length} files).`,
        `[${new Date().toLocaleTimeString()}] Framework detected: ${inspection.detectedFramework}.`,
      ],
      diagnostics,
      apkAvailable: false,
      toolchain,
      timestamp: now,
    },
    importMetadata: {
      source: 'zip',
      detectedFramework: inspection.detectedFramework,
      dependencies: inspection.dependencies,
      warnings: inspection.warnings,
    },
    history: [
      {
        id: `hist-${Date.now()}`,
        action: 'project_imported_zip',
        detail: `Imported "${name}" (${files.length} files, ${inspection.detectedFramework}).`,
        timestamp: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  project = appendProjectVersion(project, 'Initial ZIP Import', 'import', `${files.length} files imported`);
  return upsertProject(project);
}
