/**
 * App-level orchestration helpers shared by the CLI commands and the watcher daemon.
 * Wraps process discovery and termination so every caller applies the same matching rules
 * and self-protection guards.
 * @module apps
 */

import { findProcesses, terminateProcess } from './process.js';

/**
 * Terminates every running process belonging to the given apps.
 * Skips the calling process so the watcher can never kill itself. Failures are reported through
 * the optional logger rather than thrown, so one stubborn process cannot abort the sweep.
 *
 * @async
 * @param {string[]} apps - User-facing app names to terminate
 * @param {Object} [options] - Options
 * @param {Object<string, string[]>} [options.aliases] - Extra app aliases from config
 * @param {(msg: string) => void} [options.log] - Optional logger for progress and failures
 * @returns {Promise<number>} Count of processes successfully terminated
 */
export async function terminateApps(apps, { aliases = {}, log } = {}) {
  let terminated = 0;

  for (const app of apps) {
    let procs;
    try {
      procs = findProcesses(app, aliases);
    } catch (e) {
      log?.(`Error listing processes for "${app}": ${e.message}`);
      continue;
    }

    for (const { pid, name } of procs) {
      if (pid === process.pid) continue;
      try {
        log?.(`Terminating "${name}" (pid ${pid})`);
        await terminateProcess(pid);
        terminated++;
      } catch (e) {
        log?.(`Failed to terminate "${name}" (pid ${pid}): ${e.message}`);
      }
    }
  }

  return terminated;
}
