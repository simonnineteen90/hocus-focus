/**
 * Start command handler.
 * Orchestrates session creation: validates inputs, acquires lock, spawns watcher daemon,
 * performs handshake with watcher, and displays success status.
 * Uses file-based IPC (session.json, ready-file) to coordinate with detached watcher.
 * @module commands/start
 */

import { randomBytes } from 'crypto';
import { spawn } from 'child_process';
import { existsSync, readFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { loadConfig } from '../config.js';
import { readSession, writeSession, deleteSession } from '../session.js';
import { acquireLock, releaseLock } from '../lock.js';
import { findProcesses, terminateProcess } from '../process.js';
import { getPaths } from '../paths.js';
import { showSuccess, showError, showStatus, showWarn } from '../display.js';
import { SessionAlreadyActiveError } from '../errors.js';
import { getSlackToken, getStatus, setStatus, interpolateStatusText } from '../slack.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WATCHER_PATH = join(__dirname, '..', 'watcher.js');

/**
 * Starts a focus session by spawning a detached watcher daemon.
 * 
 * Validates duration (1-480 min) and app list (1-20 apps), loads config for defaults,
 * checks for existing session, acquires lock, terminates any running blocked apps,
 * generates unique session ID and handshake token, spawns watcher, and waits for handshake.
 * 
 * If handshake times out (5s), kills watcher and cleans up.
 * 
 * @async
 * @param {Object} options - Command-line options
 * @param {string} options.duration - Session duration in minutes ('1' to '480'), defaults to '25'
 * @param {string} [options.apps] - Comma-separated app names; uses config.defaultApps if omitted
 * @returns {Promise<void>}
 * @throws {Error} If duration invalid, no apps specified, >20 apps, or handshake fails
 * @throws {SessionAlreadyActiveError} If session already running
 */
export async function startCommand(options) {
  const durationMinutes = parseInt(options.duration, 10);
  if (isNaN(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
    throw new Error('Duration must be between 1 and 480 minutes.');
  }

  const config = loadConfig();
  let apps = options.apps
    ? options.apps.split(',').map(a => a.trim()).filter(Boolean)
    : config.defaultApps;

  if (!apps || apps.length === 0) {
    throw new Error('No apps specified. Use --apps or set defaultApps in your config file.');
  }
  if (apps.length > 20) {
    throw new Error('Maximum of 20 apps allowed.');
  }

  // Check for existing session
  const existing = readSession();
  if (existing) throw new SessionAlreadyActiveError();

  // Acquire lock (throws SessionAlreadyActiveError if locked)
  acquireLock();

  try {
    // Terminate any currently running blocked apps
    for (const app of apps) {
      const procs = findProcesses(app);
      for (const { pid } of procs) {
        if (pid === process.pid) continue;
        try {
          await terminateProcess(pid);
        } catch {
          // Best-effort
        }
      }
    }

    // Generate session data
    const sessionId = uuidv4();
    const token = randomBytes(16).toString('hex');
    const startedAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();

    // Write session file BEFORE spawning watcher so watcher sees it on first poll
    writeSession({
      version: 1,
      sessionId,
      startedAt,
      endsAt,
      apps,
      watcher: { pid: 0, token, startedAt }, // pid updated after spawn
    });

    // Spawn detached watcher
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

    const watcherPid = child.pid;

    // Update session with real watcher PID
    writeSession({
      version: 1,
      sessionId,
      startedAt,
      endsAt,
      apps,
      watcher: { pid: watcherPid, token, startedAt },
    });

    // Wait for handshake (up to 5s)
    const { readyFile } = getPaths();
    const deadline = Date.now() + 5000;
    let handshakeOk = false;

    while (Date.now() < deadline) {
      await sleep(100);
      if (existsSync(readyFile)) {
        const fileToken = readFileSync(readyFile, 'utf8').trim();
        if (fileToken === token) {
          handshakeOk = true;
          break;
        }
      }
    }

    if (!handshakeOk) {
      try { process.kill(watcherPid, 'SIGTERM'); } catch { /* ignore */ }
      deleteSession();
      releaseLock();
      throw new Error('Watcher failed to start (handshake timeout). Check logs for details.');
    }

    // Slack status (non-fatal)
    try {
      const slackToken = getSlackToken(config);
      if (slackToken) {
        const prev = await getStatus(slackToken);
        const statusText = interpolateStatusText(config.slack?.statusText, durationMinutes);
        const statusEmoji = config.slack?.statusEmoji ?? ':technologist:';
        const statusExpiration = Math.floor(new Date(endsAt).getTime() / 1000);
        await setStatus(slackToken, { statusText, statusEmoji, statusExpiration });
        // Only on success: persist slackStatus into the session file
        const current = readSession();
        writeSession({
          ...current,
          slackStatus: {
            previousText: prev.statusText,
            previousEmoji: prev.statusEmoji,
            previousExpiration: prev.statusExpiration,
            set: true,
          },
        });
      }
    } catch (e) {
      showWarn(`Slack status update failed: ${e.message}`);
    }

    console.log('');
    showSuccess(`Focus session started for ${durationMinutes} minute${durationMinutes !== 1 ? 's' : ''}.`);
    showStatus({ apps, endsAt });

  } catch (e) {
    releaseLock();
    throw e;
  }
}

/**
 * Utility to create a promise-based delay.
 * Used for polling loops and timeouts.
 * @private
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
