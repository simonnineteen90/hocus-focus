/**
 * Session bootstrap module.
 *
 * Shared by `focus start` (block mode) and `focus comms` (comms mode). Handles the parts that are
 * identical for both: acquiring the single-session lock, writing the session file, spawning the
 * detached watcher daemon and completing the readiness handshake.
 *
 * @module sessionRunner
 */

import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { readSession, writeSession, deleteSession } from './session.js';
import { acquireLock, releaseLock } from './lock.js';
import { getPaths } from './paths.js';
import { SessionAlreadyActiveError } from './errors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WATCHER_PATH = join(__dirname, 'watcher.js');

/**
 * Creates a session and brings up its watcher daemon.
 *
 * @async
 * @param {Object} params - Session parameters
 * @param {'block'|'comms'} params.mode - Session mode
 * @param {string[]} params.apps - Apps the session governs
 * @param {number|null} params.durationMinutes - Session length, or null for an open-ended session
 * @param {(session: Object) => Promise<void>} [params.beforeSpawn] - Hook run after the lock is held
 *   but before the watcher starts, used for one-off actions like killing or launching apps
 * @throws {SessionAlreadyActiveError} If another session is already running
 * @throws {Error} If the watcher fails its startup handshake
 * @returns {Promise<Object>} The persisted session object
 */
export async function startSession({ mode, apps, durationMinutes, beforeSpawn }) {
  if (readSession()) throw new SessionAlreadyActiveError();

  acquireLock();

  try {
    const sessionId = uuidv4();
    const token = randomBytes(16).toString('hex');
    const startedAt = new Date().toISOString();
    const endsAt = durationMinutes
      ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
      : null;

    const session = {
      version: 1,
      mode,
      sessionId,
      startedAt,
      endsAt,
      apps,
      watcher: { pid: 0, token, startedAt },
    };

    await beforeSpawn?.(session);

    // Write the session file before spawning so the watcher sees it on its first poll.
    writeSession(session);

    const child = spawn(process.execPath, [WATCHER_PATH], {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        FOCUS_SESSION_ID: sessionId,
        FOCUS_TOKEN: token,
      },
    });
    child.unref();

    session.watcher.pid = child.pid;
    writeSession(session);

    if (!(await awaitHandshake(token))) {
      try { process.kill(child.pid, 'SIGTERM'); } catch { /* ignore */ }
      deleteSession();
      releaseLock();
      throw new Error('Watcher failed to start (handshake timeout). Check logs for details.');
    }

    return session;
  } catch (e) {
    releaseLock();
    throw e;
  }
}

/**
 * Waits up to 5 seconds for the watcher to write its ready-file containing the session token.
 * @private
 * @async
 * @param {string} token - Expected token value
 * @returns {Promise<boolean>} True if the handshake completed in time
 */
async function awaitHandshake(token) {
  const { readyFile } = getPaths();
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    await sleep(100);
    if (!existsSync(readyFile)) continue;
    if (readFileSync(readyFile, 'utf8').trim() === token) return true;
  }

  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
