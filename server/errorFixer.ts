import type { ErrorFixProposal, NexoraProject, ProjectFile } from '../src/types/nexora.ts';
import { DEFAULT_USER_ID, dbAppendProjectHistory, dbGetProject, dbUpsertProject } from './database.ts';
import { invokeFreeModelText, routeFreeModel } from './modelHub.ts';
import { runProjectBuild, validateProjectStructure, writeWorkspaceFilesToDisk } from './projectEngine.ts';
import { getRunnerStatus } from './sandboxRunner.ts';
import { runProjectTestSuite } from './testingEngine.ts';
import { appendProjectVersion } from './versionHistory.ts';

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
    throw new Error('AI Error Fixer returned non-JSON output.');
  }
}

export async function diagnoseProjectErrors(input: {
  projectId: string;
  ownerId?: string;
  selectedModelId?: string;
  smartRouting?: boolean;
}): Promise<ErrorFixProposal> {
  const ownerId = input.ownerId || DEFAULT_USER_ID;
  const project = dbGetProject(input.projectId, ownerId);
  if (!project) throw new Error('Project not found.');

  const diagnostics = validateProjectStructure(project.files, project.type);
  const runner = getRunnerStatus(project.id);
  const latestTest = project.testRuns?.[0];
  const failingTests = latestTest ? latestTest.cases.filter((c) => !c.passed) : [];

  const errorContext = [
    ...diagnostics.filter((d) => d.severity !== 'info').map((d) => `[${d.severity}] ${d.file}: ${d.message}`),
    ...failingTests.map((t) => `[TEST_FAIL] ${t.name}: ${t.message}`),
    ...(runner.lastError ? [`[RUNTIME_ERROR] ${runner.lastError}`] : []),
    ...project.build.logs.filter((l) => l.includes('[ERROR]') || l.includes('failed')).slice(-8),
  ];

  if (errorContext.length === 0) {
    return {
      id: `fix-${Date.now()}`,
      summary: 'No blocking structural, syntax, or runtime errors were detected in the current workspace.',
      rootCause: 'All project diagnostics are currently clean.',
      affectedFiles: [],
      proposedFiles: [],
      modelUsed: 'Workspace Validator',
    };
  }

  const useSmart = input.smartRouting ?? project.smartRouting;
  const routed = routeFreeModel(
    'reasoning',
    useSmart ? undefined : input.selectedModelId || project.selectedModelId
  );

  const fileContext = project.files
    .slice(0, 12)
    .map((f) => `FILE: ${f.path}\n${f.content.slice(0, 2600)}`)
    .join('\n\n---\n\n');

  const systemInstruction = `You are Nexora Studio's AI Error Fixer.
Inspect real diagnostics, build errors, and runtime errors, identify the root cause, and return ONLY valid JSON:
{
  "summary": "Concise summary of the fix",
  "rootCause": "Exact root cause explanation",
  "proposedFiles": [
    { "path": "exact/file/path", "language": "html|javascript|kotlin|xml|gradle|json", "content": "complete corrected file content" }
  ],
  "proposedPreviewHtml": "optional updated complete HTML preview if applicable, otherwise null"
}`;

  const prompt = `Project Name: ${project.name} (${project.type})
Detected Errors & Diagnostics:
${errorContext.join('\n')}

Workspace Files:
${fileContext}`;

  const aiResult = await invokeFreeModelText({
    modelId: routed.model.id,
    systemInstruction,
    prompt,
    jsonMode: true,
  });

  const parsed = extractJsonObject(aiResult.text);
  const rawFiles = Array.isArray(parsed.proposedFiles) ? parsed.proposedFiles : [];
  const proposedFiles: ProjectFile[] = rawFiles
    .filter((f): f is Record<string, unknown> => Boolean(f && typeof f === 'object'))
    .map((f) => ({
      path: String(f.path || '').trim(),
      language: String(f.language || 'text'),
      content: String(f.content ?? ''),
    }))
    .filter((f) => Boolean(f.path));

  return {
    id: `fix-${Date.now()}`,
    summary: String(parsed.summary || 'Proposed structural/code fix'),
    rootCause: String(parsed.rootCause || errorContext[0]),
    affectedFiles: proposedFiles.map((f) => f.path),
    proposedFiles,
    proposedPreviewHtml:
      typeof parsed.proposedPreviewHtml === 'string' && parsed.proposedPreviewHtml.trim()
        ? parsed.proposedPreviewHtml
        : undefined,
    modelUsed: `${routed.provider.name} · ${routed.model.name}`,
  };
}

export async function applyErrorFixAndVerify(input: {
  projectId: string;
  proposal: ErrorFixProposal;
  ownerId?: string;
}): Promise<{ project: NexoraProject; testPassed: boolean }> {
  const ownerId = input.ownerId || DEFAULT_USER_ID;
  const project = dbGetProject(input.projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  if (!input.proposal.proposedFiles || input.proposal.proposedFiles.length === 0) {
    throw new Error('No file patches included in the error-fix proposal.');
  }

  // Create automatic safety checkpoint BEFORE applying AI fix
  let updated = appendProjectVersion(
    project,
    `Before AI Fix (${new Date().toLocaleTimeString()})`,
    'checkpoint',
    input.proposal.summary
  );

  const nextFiles = [...updated.files];
  for (const patch of input.proposal.proposedFiles) {
    const idx = nextFiles.findIndex((f) => f.path === patch.path);
    if (idx >= 0) {
      nextFiles[idx] = patch;
    } else {
      nextFiles.push(patch);
    }
  }

  const nextHtml =
    input.proposal.proposedPreviewHtml ||
    nextFiles.find((f) => f.path.endsWith('index.html'))?.content ||
    updated.previewHtml;

  updated = dbUpsertProject({
    ...updated,
    files: nextFiles,
    previewHtml: nextHtml,
    build: {
      ...updated.build,
      diagnostics: validateProjectStructure(nextFiles, updated.type),
    },
  });
  writeWorkspaceFilesToDisk(updated);

  // Automatically re-test and re-build after applying the fix
  const testResult = await runProjectTestSuite(updated.id, ownerId);
  const rebuilt = await runProjectBuild(testResult.project.id, ownerId);

  const finalProj =
    dbAppendProjectHistory(
      rebuilt.id,
      'ai_error_fix_verified',
      `Applied fix (${input.proposal.affectedFiles.join(', ')}) -> Tests: ${testResult.testRun.passedCount}/${testResult.testRun.total} passed.`,
      ownerId
    ) || rebuilt;

  return {
    project: finalProj,
    testPassed: testResult.testRun.status === 'passed',
  };
}
