/**
 * Process management module.
 * Provides cross-platform process discovery and termination via platform-specific adapters.
 * Handles graceful shutdown (SIGTERM) with forced termination (SIGKILL) as fallback.
 * @module process
 */

import { matchesApp } from './appMatch.js';

let platform;
if (process.platform === 'darwin') {
  platform = await import('./platform/darwin.js');
} else {
  platform = await import('./platform/linux.js');
}

export const { normalise } = platform;

/**
 * Finds all running processes belonging to an app.
 * Matching is delegated to the appMatch module, which compares both the executable name and any
 * `.app` bundle in the command path against the app name and its aliases. This catches apps whose
 * binary is named differently from the app (Teams ships `MSTeams`) along with their helper processes.
 *
 * @param {string} appName - Application name to search for (e.g., 'Slack', 'Teams')
 * @param {Object<string, string[]>} [aliases] - Extra aliases keyed by app name, from config
 * @returns {Array<{pid: number, name: string, command: string}>} Array of matching processes
 */
export function findProcesses(appName, aliases = {}) {
  const all = platform.listProcesses();
  return all.filter(p => matchesApp(p, appName, aliases));
}

/**
 * Terminates a process gracefully with forced fallback.
 * Sends SIGTERM first and waits up to 2 seconds for graceful exit.
 * If process still running after 2s, sends SIGKILL for forced termination.
 * Returns silently if process already gone (ESRCH).
 * 
 * @async
 * @param {number} pid - Process ID to terminate
 * @throws {Error} If termination fails with permission error (EPERM)
 * @returns {Promise<void>}
 */
export async function terminateProcess(pid) {
  try {
    process.kill(pid, 'SIGTERM');
  } catch (e) {
    if (e.code === 'ESRCH') return; // already gone
    throw e;
  }

  // Wait up to 2s for process to exit, then SIGKILL
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    await sleep(100);
    if (!isAlive(pid)) return;
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch (e) {
    if (e.code !== 'ESRCH') throw e;
  }
}

/**
 * Tests if a process is alive using process.kill(pid, 0).
 * Does not send any signal; only tests for process existence.
 * @private
 * @param {number} pid - Process ID to check
 * @returns {boolean} True if process exists, false otherwise
 */
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
