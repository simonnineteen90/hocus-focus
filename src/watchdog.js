/**
 * Watchdog module.
 * Verifies watcher daemon health and recovers from stale/dead watcher states.
 * Performs three checks: PID aliveness, ready-file existence, and token validity.
 * @module watchdog
 */

import { readSession, deleteSession } from './session.js';
import { releaseLock } from './lock.js';
import { getPaths } from './paths.js';
import { WatcherStaleError } from './errors.js';
import { existsSync, readFileSync, unlinkSync } from 'fs';

/**
 * Verifies if a watcher daemon is healthy and responsive.
 * Checks three conditions: PID is alive, ready-file exists, token matches.
 * All three must pass for watcher to be considered alive and not stale.
 * 
 * @param {Object} session - Session object containing watcher metadata
 * @returns {Object} Object with properties: alive (boolean), stale (boolean)
 */
export function verifyWatcher(session) {
  if (!session || !session.watcher) return { alive: false, stale: true };

  const { pid, token } = session.watcher;
  const { readyFile } = getPaths();

  // Check PID alive
  let pidAlive = false;
  try {
    process.kill(pid, 0);
    pidAlive = true;
  } catch (e) {
    if (e.code !== 'ESRCH' && e.code !== 'EPERM') throw e;
    if (e.code === 'EPERM') pidAlive = true; // process exists, no permission
  }

  if (!pidAlive) return { alive: false, stale: true };

  // Check token
  if (!existsSync(readyFile)) return { alive: false, stale: true };
  try {
    const fileToken = readFileSync(readyFile, 'utf8').trim();
    if (fileToken !== token) return { alive: false, stale: true };
  } catch {
    return { alive: false, stale: true };
  }

  return { alive: true, stale: false };
}

/**
 * Recovers from a stale or dead watcher state.
 * Sends SIGTERM to the stale watcher PID (best-effort), then performs full session cleanup:
 * deletes session file, releases lock, removes ready-file.
 * Always throws WatcherStaleError after cleanup to signal caller that recovery occurred.
 * 
 * @param {Object} session - Session object containing watcher metadata
 * @throws {WatcherStaleError} Always thrown after cleanup
 * @returns {void}
 */
export function recoverWatcher(session) {
  if (session?.watcher?.pid) {
    try {
      process.kill(session.watcher.pid, 'SIGTERM');
    } catch {
      // ignore
    }
  }
  deleteSession();
  releaseLock();
  const { readyFile } = getPaths();
  try { unlinkSync(readyFile); } catch { /* ignore */ }
  throw new WatcherStaleError();
}
