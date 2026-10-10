// Reorganize in place: moves the original files inside a folder the user picks, following an approved proposal.
// Every move is copy, verify, then delete the original, so a failure never loses a file. A restore log written
// to the folder before anything moves records each finished move, and restoreInPlace() moves them back.
import {verifiedCopy} from './export.js';
import {pathKey} from './paths.js';
import {acquireExportLock} from '../transfer/resources.js';

export const RESTORE_LOG = 'SortU-restore-log.json';
const check = signal => {if (signal?.aborted) throw new Error('Reorganize canceled.');};
const missing = error => error?.name === 'NotFoundError' || error?.name === 'TypeMismatchError';

// Where the selected file lives inside the chosen folder. Folder selections carry "Folder/sub/file";
// single files picked with Add files sit at the top of the folder the user chooses.
export function folderRelative(entry) {
  return entry.file?.webkitRelativePath ? entry.sourcePath.split('/').slice(1).join('/') : entry.sourcePath;
}
// The top folder name of a folder selection, or null for files picked one by one.
export const selectedFolderName = entries => entries.find(entry => entry.file?.webkitRelativePath)?.sourcePath.split('/')[0] ?? null;

async function walk(root, path, {create = false} = {}) {
  const parts = path.split('/'), name = parts.pop();let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, {create});
  return {dir, name};
}
// 'file', 'folder' or null. A file sitting where a folder is needed counts as taken.
async function kindAt(root, path) {
  let dir = root;const parts = path.split('/'), name = parts.pop();
  for (const part of parts) {
    try {dir = await dir.getDirectoryHandle(part);}
    catch (error) {if (!missing(error)) throw error;try {await dir.getFileHandle(part);return 'file';} catch (inner) {if (missing(inner)) return null;throw inner;}}
  }
  try {await dir.getFileHandle(name);return 'file';} catch (error) {if (!missing(error)) throw error;}
  try {await dir.getDirectoryHandle(name);return 'folder';} catch (error) {if (!missing(error)) throw error;}
  return null;
}
async function fileAt(root, path) {
  try {const {dir, name} = await walk(root, path);return await (await dir.getFileHandle(name)).getFile();}
  catch (error) {if (missing(error)) return null;throw error;}
}

// Checks the chosen folder against the approved proposal. Nothing is written.
// Returns the moves, files already in place, and problems that block starting.
export async function planInPlace(session, permit, root) {
  const snapshot = session.resolveApproval(permit), problems = [], moves = [], unchanged = [];
  const expected = selectedFolderName(snapshot.entries);
  if (expected && root.name !== expected) return {folder: root.name, moves, unchanged, problems: [`You chose "${root.name}", but these files came from "${expected}". Choose that folder.`], replacesLog: false};
  const strip = expected && snapshot.rules.groupBy === 'folders' ? `${expected}/` : null;
  for (const entry of snapshot.entries) {
    const row = snapshot.rows.find(item => item.fileId === entry.id), from = folderRelative(entry);
    let to = row.targetPath;if (strip && to.startsWith(strip)) to = to.slice(strip.length);
    if (pathKey(from) === pathKey(RESTORE_LOG)) {problems.push(`Uncheck ${RESTORE_LOG} in Selected files. It holds the undo steps for an earlier reorganize.`);continue;}
    if (pathKey(to) === pathKey(RESTORE_LOG)) {problems.push(`${to} is reserved for the restore log. Edit that path.`);continue;}
    // Case-only renames are skipped: on Windows they would copy a file onto itself.
    if (pathKey(from) === pathKey(to)) {unchanged.push(from);continue;}
    const found = await fileAt(root, from);
    if (!found) problems.push(`${from} was not found in "${root.name}".`);
    else if (found.size !== entry.size || found.lastModified !== entry.lastModified) problems.push(`${from} changed after you selected it. Select the folder again.`);
    moves.push({fileId: entry.id, from, to, size: entry.size});
  }
  const sources = new Set(moves.map(move => pathKey(move.from)));
  for (const move of moves) {
    const taken = await kindAt(root, move.to);
    if (taken && sources.has(pathKey(move.to))) problems.push(`${move.to} is another selected file that also moves. Edit the path so the two do not swap.`);
    else if (taken) problems.push(`${move.to} already exists in "${root.name}". Edit the path or move that ${taken} first.`);
  }
  const replacesLog = (await kindAt(root, RESTORE_LOG)) === 'file';
  return {folder: root.name, moves, unchanged, problems: [...new Set(problems)], replacesLog};
}

async function writeLog(root, log) {
  const handle = await root.getFileHandle(RESTORE_LOG, {create: true}), writer = await handle.createWritable();
  try {await writer.write(new TextEncoder().encode(JSON.stringify(log, null, 2)));await writer.close();}
  catch (error) {await writer.abort?.().catch(() => {});throw error;}
}
async function moveFile(root, from, to, signal) {
  const source = await walk(root, from), file = await (await source.dir.getFileHandle(source.name)).getFile();
  if (await kindAt(root, to)) throw new Error(`${to} already exists.`);
  const target = await walk(root, to, {create: true}), handle = await target.dir.getFileHandle(target.name, {create: true});
  let sha256;
  try {sha256 = await verifiedCopy(file, handle, signal);}
  catch (error) {await target.dir.removeEntry(target.name).catch(() => {});throw error;}
  await source.dir.removeEntry(source.name);
  return sha256;
}
// Removes folders left empty by the moves, deepest first. removeEntry without recursive refuses non-empty folders.
async function pruneEmpty(root, paths) {
  const folders = new Set();
  for (const path of paths) {const parts = path.split('/').slice(0, -1);while (parts.length) {folders.add(parts.join('/'));parts.pop();}}
  for (const folder of [...folders].sort((a, b) => b.split('/').length - a.split('/').length)) {
    try {const {dir, name} = await walk(root, folder);await dir.removeEntry(name);} catch {}
  }
}

// Runs the moves from planInPlace(). Returns {state:'done'|'partial'|'canceled', moved, error}.
export async function applyInPlace(session, permit, root, plan, {signal, onProgress = () => {}, now = () => new Date()} = {}) {
  if (plan.problems.length) throw new Error('Fix the listed problems before reorganizing.');
  const release = await acquireExportLock('organizer', signal), moved = [];
  const log = {app: 'SortU', version: 1, folder: plan.folder, createdAt: now().toISOString(), moves: plan.moves.map(({from, to, size}) => ({from, to, size, sha256: null, done: false}))};
  try {
    check(signal);session.resolveApproval(permit);
    await writeLog(root, log);
    for (const [index, move] of log.moves.entries()) {
      check(signal);session.resolveApproval(permit);onProgress({path: move.from, completed: index, total: log.moves.length});
      move.sha256 = await moveFile(root, move.from, move.to, signal);move.done = true;moved.push(move.to);
      await writeLog(root, log);
    }
    await pruneEmpty(root, log.moves.map(move => move.from));
    return {state: 'done', moved, folder: plan.folder};
  } catch (error) {
    if (!moved.length && !log.moves.some(move => move.done)) await root.removeEntry?.(RESTORE_LOG).catch(() => {});
    return {state: signal?.aborted ? 'canceled' : 'partial', moved, folder: plan.folder, error: error.message};
  } finally {release();}
}

export async function readRestoreLog(root) {
  const file = await fileAt(root, RESTORE_LOG);
  if (!file) throw new Error(`"${root.name}" has no ${RESTORE_LOG}. Choose the folder you reorganized.`);
  let log;try {log = JSON.parse(await file.text());} catch {throw new Error(`${RESTORE_LOG} is damaged and cannot be used.`);}
  if (log?.app !== 'SortU' || log.version !== 1 || !Array.isArray(log.moves)) throw new Error(`${RESTORE_LOG} is not a SortU restore log.`);
  return log;
}
// Which finished moves can go back. A file that is gone, or whose old place is taken, is skipped and listed.
export async function planRestore(root, log) {
  const moves = [], skipped = [];
  for (const move of log.moves.filter(item => item.done).reverse()) {
    if (typeof move.from !== 'string' || typeof move.to !== 'string') continue;
    if ((await kindAt(root, move.to)) !== 'file') skipped.push(`${move.to} is no longer there.`);
    else if (await kindAt(root, move.from)) skipped.push(`${move.from} is taken by another file or folder.`);
    else moves.push({from: move.to, to: move.from});
  }
  return {folder: root.name, moves, skipped};
}
// Moves files back to where they were. The log is deleted once nothing is left to restore.
export async function restoreInPlace(root, log, plan, {signal, onProgress = () => {}} = {}) {
  const release = await acquireExportLock('organizer', signal), restored = [];
  try {
    for (const [index, move] of plan.moves.entries()) {
      check(signal);onProgress({path: move.from, completed: index, total: plan.moves.length});
      await moveFile(root, move.from, move.to, signal);restored.push(move.to);
      const entry = log.moves.find(item => item.done && item.to === move.from && item.from === move.to);if (entry) entry.done = false;
    }
    await pruneEmpty(root, plan.moves.map(move => move.from));
    if (log.moves.some(move => move.done)) await writeLog(root, log);else await root.removeEntry(RESTORE_LOG).catch(() => {});
    return {state: 'done', restored};
  } catch (error) {
    await writeLog(root, log).catch(() => {});
    return {state: signal?.aborted ? 'canceled' : 'partial', restored, error: error.message};
  } finally {release();}
}
