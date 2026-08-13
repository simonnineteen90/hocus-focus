#!/usr/bin/env node
/**
 * Watcher daemon — runs detached in the background.
 * Spawned by `focus start` / `focus comms` with FOCUS_SESSION_ID and FOCUS_TOKEN env vars.
 *
 * Polls every 3 seconds to verify the session is still active and hasn't expired.
 *
 * In block mode it terminates any running instance of the blocked apps on every poll.
 * In comms mode it leaves the apps alone while the session runs, and quits them once on shutdown —
 * whether that shutdown comes from the timer expiring or from `focus stop`.
 *
 * A comms session with no end time runs indefinitely until stopped.
 * All activity is logged to the focus.log file in the state directory.
 *
 * @module watcher
 */

import { writeFileSync, unlinkSync } from 'fs';
import { getPaths } from './paths.js';
import { readSession, deleteSession } from './session.js';
import { releaseLock } from './lock.js';
import { terminateApps } from './apps.js';
import { loadConfig } from './config.js';
import { log } from './logger.js';

const sessionId = process.env.FOCUS_SESSION_ID;
const token = process.env.FOCUS_TOKEN;

if (!sessionId || !token) {
  process.exit(1);
}

const paths = getPaths();
const aliases = loadConfig().appAliases ?? {};

try {
  writeFileSync(paths.readyFile, token, { mode: 0o600 });
} catch (e) {
  log(`Failed to write ready-file: ${e.message}`);
  process.exit(1);
}

log(`Watcher started. Session: ${sessionId}`);

let shuttingDown = false;

// Seed from the session file immediately: `focus stop` can arrive before the first poll, and comms
// mode still needs to know which apps to close on the way out.
const initial = readSession();
let knownApps = initial?.apps ?? [];
let knownMode = initial?.mode ?? 'block';

/**
 * Shuts the watcher down, releasing all session state.
 * In comms mode the comms apps are quit on the way out, which is the whole point of the mode's timer.
 * @async
 * @param {string} reason - Human-readable shutdown reason for the log
 * @returns {Promise<void>}
 */
async function cleanup(reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Watcher stopping: ${reason}`);

  if (knownMode === 'comms' && knownApps.length > 0) {
    log('Comms mode ending — closing comms apps');
    await terminateApps(knownApps, { aliases, log });
  }

  deleteSession();
  releaseLock();
  try { unlinkSync(paths.readyFile); } catch { /* ignore */ }
  process.exit(0);
}

/**
 * Single poll iteration: validates the session, checks for expiry, and enforces block mode.
 * @async
 * @returns {Promise<void>}
 */
async function poll() {
  if (shuttingDown) return;

  const session = readSession();

  if (!session || session.sessionId !== sessionId) {
    await cleanup('session gone or replaced');
    return;
  }

  knownApps = session.apps ?? [];
  knownMode = session.mode ?? 'block';

  if (hasExpired(session)) {
    log('Session expired');
    await cleanup('timer expired');
    return;
  }

  // Comms mode is passive — the apps are meant to be running.
  if (knownMode === 'comms') return;

  await terminateApps(knownApps, { aliases, log });
}

/**
 * Tests whether a session has passed its end time.
 * Sessions without an end time (open-ended comms mode) never expire.
 * @param {Object} session - Session object
 * @returns {boolean} True if the session should end now
 */
function hasExpired(session) {
  if (!session.endsAt) return false;
  const endsAt = new Date(session.endsAt).getTime();
  return !Number.isNaN(endsAt) && Date.now() >= endsAt;
}

// Start polling every 3 seconds (first poll after 3s — session is already written)
const interval = setInterval(poll, 3000);

process.on('SIGTERM', () => cleanup('SIGTERM received'));
process.on('SIGINT', () => cleanup('SIGINT received'));
process.on('uncaughtException', (e) => {
  log(`Uncaught exception: ${e.message}`);
  clearInterval(interval);
  cleanup('uncaught exception').then(() => process.exit(1));
});
