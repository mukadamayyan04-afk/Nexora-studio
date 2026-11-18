import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import type { NexoraProject, TestCaseResult, TestRunResult } from '../src/types/nexora.ts';
import { DEFAULT_USER_ID, WORKSPACES_DIR, dbAppendProjectHistory, dbGetProject, dbUpsertProject } from './database.ts';
import { validateProjectStructure } from './projectEngine.ts';
import { getRunnerStatus } from './sandboxRunner.ts';

export async function runProjectTestSuite(
  projectId: string,
  ownerId = DEFAULT_USER_ID
): Promise<{ project: NexoraProject; testRun: TestRunResult }> {
  const project = dbGetProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');

  const suiteStart = Date.now();
  const cases: TestCaseResult[] = [];

  // 1. Structural & Manifest validation
  const structStart = Date.now();
  const diagnostics = validateProjectStructure(project.files, project.type);
  const structErrors = diagnostics.filter((d) => d.severity === 'error');
  cases.push({
    id: 'test-structure',
    name: `Project Structure Validation (${project.type})`,
    category: 'structure',
    passed: structErrors.length === 0,
    message:
      structErrors.length === 0
        ? `Passed structural checks across ${project.files.length} files.`
        : structErrors.map((e) => `${e.file}: ${e.message}`).join(' | '),
    durationMs: Date.now() - structStart,
  });

  // 2. JSON Validity checks
  for (const file of project.files.filter((f) => f.path.endsWith('.json'))) {
    const t0 = Date.now();
    try {
      JSON.parse(file.content);
      cases.push({
        id: `test-json-${file.path}`,
        name: `JSON Parse: ${file.path}`,
        category: 'syntax',
        passed: true,
        message: 'Valid JSON syntax.',
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      cases.push({
        id: `test-json-${file.path}`,
        name: `JSON Parse: ${file.path}`,
        category: 'syntax',
        passed: false,
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      });
    }
  }

  // 3. JavaScript syntax parse check using isolated vm.Script (does NOT execute!)
  for (const file of project.files.filter((f) => f.path.endsWith('.js') || f.path.endsWith('.mjs'))) {
    const t0 = Date.now();
    try {
      // Strip ESM import/export lines just for syntax parsing inside vm.Script if module syntax is used
      const parsable = file.content
        .replace(/^\s*import\s+.*?;?\s*$/gm, '// import')
        .replace(/^\s*export\s+(default\s+)?/gm, '')
        .replace(/\bimport\.meta\b/g, '({ url: "" })');
      new vm.Script(parsable, { filename: file.path });
      cases.push({
        id: `test-js-${file.path}`,
        name: `JS Syntax Check: ${file.path}`,
        category: 'syntax',
        passed: true,
        message: 'Parsed cleanly with zero syntax errors.',
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      cases.push({
        id: `test-js-${file.path}`,
        name: `JS Syntax Check: ${file.path}`,
        category: 'syntax',
        passed: false,
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      });
    }
  }

  // 4. HTML document integrity check (for website or HTML5 games)
  const htmlFiles = project.files.filter((f) => f.path.endsWith('.html'));
  for (const file of htmlFiles) {
    const t0 = Date.now();
    const lower = file.content.toLowerCase();
    const ok = lower.includes('<html') && lower.includes('</html>') && lower.includes('<body');
    cases.push({
      id: `test-html-${file.path}`,
      name: `HTML Markup Check: ${file.path}`,
      category: 'syntax',
      passed: ok,
      message: ok ? 'Valid <html> and <body> root tags present.' : 'Missing closing </html> or <body> element.',
      durationMs: Date.now() - t0,
    });
  }

  // 5. Live HTTP health & API endpoint check if sandbox runner is active
  const runner = getRunnerStatus(project.id);
  if (runner.status === 'running' && runner.port) {
    const t0 = Date.now();
    try {
      const healthRes = await fetch(`http://127.0.0.1:${runner.port}/`, {
        signal: AbortSignal.timeout(3000),
      });
      cases.push({
        id: 'test-runtime-http',
        name: `Live Sandbox HTTP Check (127.0.0.1:${runner.port})`,
        category: 'api',
        passed: healthRes.ok,
        message: `Live server responded HTTP ${healthRes.status}.`,
        durationMs: Date.now() - t0,
      });
    } catch (err) {
      cases.push({
        id: 'test-runtime-http',
        name: `Live Sandbox HTTP Check (127.0.0.1:${runner.port})`,
        category: 'api',
        passed: false,
        message: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      });
    }
  }

  // 6. APK Artifact Verification (for Android / Game APK targets)
  if (project.build.apkAvailable) {
    const t0 = Date.now();
    const apkPath = path.join(WORKSPACES_DIR, project.id, 'app/build/outputs/apk/debug/app-debug.apk');
    const exists = fs.existsSync(apkPath);
    const size = exists ? fs.statSync(apkPath).size : 0;
    cases.push({
      id: 'test-apk-artifact',
      name: 'Compiled APK Artifact Check',
      category: 'artifact',
      passed: exists && size > 0,
      message: exists ? `Verified binary on disk (${size} bytes).` : 'Expected APK missing on disk.',
      durationMs: Date.now() - t0,
    });
  }

  const passedCount = cases.filter((c) => c.passed).length;
  const failedCount = cases.length - passedCount;
  const testRun: TestRunResult = {
    id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    status: failedCount === 0 ? 'passed' : 'failed',
    total: cases.length,
    passedCount,
    failedCount,
    durationMs: Date.now() - suiteStart,
    cases,
    timestamp: new Date().toISOString(),
  };

  const nextRuns = [testRun, ...(project.testRuns || [])].slice(0, 20);
  const updated = dbUpsertProject({
    ...project,
    testRuns: nextRuns,
  });
  const withHistory =
    dbAppendProjectHistory(
      projectId,
      'tests_executed',
      `Test suite finished: ${passedCount}/${cases.length} passed.`,
      ownerId
    ) || updated;

  return { project: withHistory, testRun };
}
