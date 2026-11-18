import type { NexoraProject, ProjectFile, ProjectVersion } from '../src/types/nexora.ts';
import { DEFAULT_USER_ID, dbAppendProjectHistory, dbGetProject, dbUpsertProject } from './database.ts';
import { writeWorkspaceFilesToDisk } from './projectEngine.ts';

export interface FileDiffSummary {
  path: string;
  status: 'added' | 'removed' | 'modified' | 'unchanged';
  addedLines: number;
  removedLines: number;
  previewLines: Array<{ type: '+' | '-' | ' '; text: string }>;
}

function cloneFiles(files: ProjectFile[]): ProjectFile[] {
  return files.map((f) => ({ path: f.path, language: f.language, content: f.content }));
}

export function createCheckpointSnapshot(
  project: NexoraProject,
  label: string,
  kind: ProjectVersion['kind'],
  summary: string
): ProjectVersion {
  return {
    id: `ver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label,
    kind,
    summary,
    filesSnapshot: cloneFiles(project.files),
    previewHtmlSnapshot: project.previewHtml,
    createdAt: new Date().toISOString(),
  };
}

export function appendProjectVersion(
  project: NexoraProject,
  label: string,
  kind: ProjectVersion['kind'],
  summary: string,
  clearRedo = true
): NexoraProject {
  const version = createCheckpointSnapshot(project, label, kind, summary);
  const nextVersions = [version, ...(project.versions || [])].slice(0, 30);
  return {
    ...project,
    versions: nextVersions,
    redoVersions: clearRedo ? [] : project.redoVersions || [],
  };
}

export function createManualCheckpoint(
  projectId: string,
  label: string,
  summary?: string,
  ownerId = DEFAULT_USER_ID
): { project: NexoraProject; version: ProjectVersion } {
  const project = dbGetProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  const version = createCheckpointSnapshot(
    project,
    label.trim() || `Checkpoint ${(project.versions?.length || 0) + 1}`,
    'checkpoint',
    summary?.trim() || `Saved ${project.files.length} files`
  );
  const updated = dbUpsertProject({
    ...project,
    versions: [version, ...(project.versions || [])].slice(0, 30),
    redoVersions: [],
  });
  const withHistory =
    dbAppendProjectHistory(
      projectId,
      'checkpoint_created',
      `Created checkpoint "${version.label}" (${project.files.length} files).`,
      ownerId
    ) || updated;
  return { project: withHistory, version };
}

export function computeVersionDiff(
  currentFiles: ProjectFile[],
  targetSnapshot: ProjectFile[]
): FileDiffSummary[] {
  const currentMap = new Map(currentFiles.map((f) => [f.path, f.content]));
  const targetMap = new Map(targetSnapshot.map((f) => [f.path, f.content]));
  const allPaths = Array.from(new Set([...currentMap.keys(), ...targetMap.keys()])).sort();

  const diffs: FileDiffSummary[] = [];
  for (const filePath of allPaths) {
    const cur = currentMap.get(filePath);
    const tgt = targetMap.get(filePath);
    if (cur === undefined && tgt !== undefined) {
      const lines = tgt.split('\n');
      diffs.push({
        path: filePath,
        status: 'added',
        addedLines: lines.length,
        removedLines: 0,
        previewLines: lines.slice(0, 14).map((text) => ({ type: '+', text })),
      });
    } else if (cur !== undefined && tgt === undefined) {
      const lines = cur.split('\n');
      diffs.push({
        path: filePath,
        status: 'removed',
        addedLines: 0,
        removedLines: lines.length,
        previewLines: lines.slice(0, 14).map((text) => ({ type: '-', text })),
      });
    } else if (cur !== undefined && tgt !== undefined) {
      if (cur === tgt) {
        diffs.push({
          path: filePath,
          status: 'unchanged',
          addedLines: 0,
          removedLines: 0,
          previewLines: [],
        });
      } else {
        const curLines = cur.split('\n');
        const tgtLines = tgt.split('\n');
        const curSet = new Set(curLines);
        const tgtSet = new Set(tgtLines);
        const removed = curLines.filter((l) => !tgtSet.has(l));
        const added = tgtLines.filter((l) => !curSet.has(l));
        const previewLines: Array<{ type: '+' | '-' | ' '; text: string }> = [
          ...removed.slice(0, 7).map((text) => ({ type: '-' as const, text })),
          ...added.slice(0, 7).map((text) => ({ type: '+' as const, text })),
        ];
        diffs.push({
          path: filePath,
          status: 'modified',
          addedLines: added.length,
          removedLines: removed.length,
          previewLines,
        });
      }
    }
  }

  return diffs;
}

export function restoreProjectVersion(
  projectId: string,
  versionId: string,
  ownerId = DEFAULT_USER_ID
): NexoraProject {
  const project = dbGetProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  const target = (project.versions || []).find((v) => v.id === versionId);
  if (!target) throw new Error('Version snapshot not found.');

  // Backup current state into redo stack so restore itself is cleanly undoable
  const currentBackup = createCheckpointSnapshot(
    project,
    `Pre-restore backup (${new Date().toLocaleTimeString()})`,
    'restore',
    `Backup before restoring "${target.label}"`
  );

  const restored = dbUpsertProject({
    ...project,
    files: cloneFiles(target.filesSnapshot),
    previewHtml: target.previewHtmlSnapshot || project.previewHtml,
    redoVersions: [currentBackup, ...(project.redoVersions || [])].slice(0, 20),
  });
  writeWorkspaceFilesToDisk(restored);
  return (
    dbAppendProjectHistory(
      projectId,
      'version_restored',
      `Restored workspace to "${target.label}".`,
      ownerId
    ) || restored
  );
}

export function undoLastProjectChange(
  projectId: string,
  ownerId = DEFAULT_USER_ID
): NexoraProject {
  const project = dbGetProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  const versions = project.versions || [];
  if (versions.length === 0) {
    throw new Error('No earlier version snapshots exist to undo.');
  }

  const [latest, ...remaining] = versions;
  const redoEntry = createCheckpointSnapshot(
    project,
    `Redo: ${latest.label}`,
    latest.kind,
    latest.summary
  );

  const restored = dbUpsertProject({
    ...project,
    files: cloneFiles(latest.filesSnapshot),
    previewHtml: latest.previewHtmlSnapshot || project.previewHtml,
    versions: remaining,
    redoVersions: [redoEntry, ...(project.redoVersions || [])].slice(0, 20),
  });
  writeWorkspaceFilesToDisk(restored);
  return (
    dbAppendProjectHistory(
      projectId,
      'undo_applied',
      `Reverted to snapshot "${latest.label}".`,
      ownerId
    ) || restored
  );
}

export function redoProjectChange(
  projectId: string,
  ownerId = DEFAULT_USER_ID
): NexoraProject {
  const project = dbGetProject(projectId, ownerId);
  if (!project) throw new Error('Project not found.');
  const redoStack = project.redoVersions || [];
  if (redoStack.length === 0) {
    throw new Error('No undone changes available to redo.');
  }

  const [nextState, ...remainingRedo] = redoStack;
  const undoEntry = createCheckpointSnapshot(
    project,
    `Before redo (${new Date().toLocaleTimeString()})`,
    'checkpoint',
    'Saved before redo'
  );

  const restored = dbUpsertProject({
    ...project,
    files: cloneFiles(nextState.filesSnapshot),
    previewHtml: nextState.previewHtmlSnapshot || project.previewHtml,
    versions: [undoEntry, ...(project.versions || [])].slice(0, 30),
    redoVersions: remainingRedo,
  });
  writeWorkspaceFilesToDisk(restored);
  return (
    dbAppendProjectHistory(
      projectId,
      'redo_applied',
      `Re-applied "${nextState.label}".`,
      ownerId
    ) || restored
  );
}
