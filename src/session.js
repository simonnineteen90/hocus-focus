import { readFileSync, writeFileSync, unlinkSync, renameSync, existsSync } from 'fs';
import { getPaths } from './paths.js';

export function readSession() {
  const { sessionFile } = getPaths();
  if (!existsSync(sessionFile)) return null;
  try {
    return JSON.parse(readFileSync(sessionFile, 'utf8'));
  } catch {
    return null;
  }
}

export function writeSession(session) {
  const { sessionFile } = getPaths();
  const tmp = sessionFile + '.tmp';
  writeFileSync(tmp, JSON.stringify(session, null, 2), { mode: 0o600 });
  renameSync(tmp, sessionFile);
}

export function deleteSession() {
  const { sessionFile } = getPaths();
  try {
    unlinkSync(sessionFile);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}
