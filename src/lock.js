/**
 * Lock management module.
 * Provides exclusive session locking via a filesystem lock file.
 * Uses O_EXCL flag for atomic creation. Stale locks are detected by checking if the PID is alive.
 * @module lock
 */

import { openSync, closeSync, readFileSync, unlinkSync, writeFileSync, constants } from 'fs';
import { getPaths } from './paths.js';
import { SessionAlreadyActiveError } from './errors.js';

/**
 * Acquires an exclusive lock for the session.
 * Creates a lock file with the current process PID.
 * Uses O_EXCL flag to ensure atomic creation (fails if file exists).
 * Automatically cleans up stale locks (when referenced PID is dead).
 * 
 * @throws {SessionAlreadyActiveError} If lock file already exists and is not stale
 * @returns {void}
 */
export function acquireLock() {
  const { lockFile } = getPaths();

  if (isLockStale()) {
    releaseLock();
  }

  let fd;
  try {
    fd = openSync(lockFile, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch (e) {
    if (e.code === 'EEXIST') throw new SessionAlreadyActiveError();
    throw e;
  }

  writeFileSync(fd, String(process.pid));
  closeSync(fd);
}

/**
 * Releases the session lock by deleting the lock file.
 * Idempotent: does not throw if lock file doesn't exist.
 * 
 * @returns {void}
 */
export function releaseLock() {
  const { lockFile } = getPaths();
  try {
    unlinkSync(lockFile);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

/**
 * Checks if the lock file represents a stale (dead) process.
 * Uses process.kill(pid, 0) to test if the PID is alive without sending a signal.
 * Returns false if no lock file exists (not stale, just absent).
 * 
 * Platform note: EPERM means the process exists but we lack permission to signal it (assume alive).
 * 
 * @returns {boolean} True if lock is stale (PID dead or invalid), false if lock is valid or missing
 */
export function isLockStale() {
  const { lockFile } = getPaths();
  try {
    const pid = parseInt(readFileSync(lockFile, 'utf8').trim(), 10);
    if (!pid || isNaN(pid)) return true;
    process.kill(pid, 0);
    return false;
  } catch (e) {
    if (e.code === 'ENOENT') return false; // no lock file at all
    if (e.code === 'ESRCH') return true;   // process gone
    if (e.code === 'EPERM') return false;  // process exists, no permission
    return false;
  }
}
