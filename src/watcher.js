#!/usr/bin/env node
/**
 * Watcher daemon — runs detached in the background.
 * Spawned by `focus start` with FOCUS_SESSION_ID and FOCUS_TOKEN env vars.
 * 
 * Polls every 3 seconds to verify the session is still active and hasn't expired.
 * For each blocked app, finds running processes and terminates them gracefully.
 * On session expiration or signal (SIGTERM/SIGINT), performs cleanup and exits.
 * All activity is logged to the focus.log file in the state directory.
 * @module watcher
 */

import { writeFileSync, unlinkSync } from 'fs';
import { getPaths } from './paths.js';
import { readSession, deleteSession } from './session.js';
import { releaseLock } from './lock.js';
import { findProcesses, terminateProcess } from './process.js';
import { log } from './logger.js';

const sessionId = process.env.FOCUS_SESSION_ID;
const token = process.env.FOCUS_TOKEN;

if (!sessionId || !token) {
  process.exit(1);
}

const paths = getPaths();

// Write ready-file so start-command can verify handshake
try {
  writeFileSync(paths.readyFile, token, { mode: 0o600 });
} catch (e) {
  log(`Failed to write ready-file: ${e.message}`);
  process.exit(1);
}

log(`Watcher started. Session: ${sessionId}`);

let shuttingDown = false;

/**
 * Cleanup handler for graceful shutdown.
 * Sets shuttingDown flag, deletes session and ready files, releases lock, then exits.
 * Idempotent: safe to call multiple times (only first call has effect).
 * 
 * @async
 * @private
 * @param {string} reason - Reason for cleanup (logged for debugging)
 * @returns {Promise<void>}
 */
async function cleanup(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Watcher stopping: ${reason}`);
  deleteSession();
  releaseLock();
  try { unlinkSync(paths.readyFile); } catch { /* ignore */ }
  process.exit(0);
}

/**
 * Main polling loop for watcher daemon.
 * Runs every 3 seconds:
 * 1. Verifies session still exists and matches expected sessionId
 * 2. Checks if session has expired
 * 3. For each blocked app, finds and terminates matching processes
 * 
 * Exits cleanly if session is gone, replaced, or expired.
 * Logs all process terminations and errors.
 * 
 * @async
 * @private
 * @returns {Promise<void>}
 */
async function poll() {
  if (shuttingDown) return;

  const session = readSession();

  if (!session || session.sessionId !== sessionId) {
    await cleanup('session gone or replaced');
    return;
  }

  if (Date.now() >= new Date(session.endsAt).getTime()) {
    log('Session expired — unblocking apps');
    await cleanup('timer expired');
    return;
  }

  for (const app of session.apps) {
    let procs;
    try {
      procs = findProcesses(app);
    } catch (e) {
      log(`Error listing processes for "${app}": ${e.message}`);
      continue;
    }

    for (const { pid, name } of procs) {
      if (pid === process.pid) continue;
      try {
        log(`Terminating "${name}" (pid ${pid})`);
        await terminateProcess(pid);
      } catch (e) {
        log(`Failed to terminate "${name}" (pid ${pid}): ${e.message}`);
      }
    }
  }
}

// Start polling every 3 seconds (first poll after 3s — session is already written)
const interval = setInterval(poll, 3000);

process.on('SIGTERM', () => cleanup('SIGTERM received'));
process.on('SIGINT', () => cleanup('SIGINT received'));
process.on('uncaughtException', (e) => {
  log(`Uncaught exception: ${e.message}`);
  cleanup('uncaught exception').then(() => process.exit(1));
});
