/**
 * Comms command handler — comms mode.
 *
 * The inverse of a focus session: opens the communication apps so the user can catch up, optionally
 * for a fixed window. Unlike block mode the watcher does not police running processes; it simply
 * waits, then quits the comms apps when the timer expires or the session is stopped.
 *
 * @module commands/comms
 */

import { loadConfig } from '../config.js';
import { launchApp } from '../launcher.js';
import { startSession } from '../sessionRunner.js';
import { resolveApps, parseDuration } from './options.js';
import { showSuccess, showStatus, showWarn } from '../display.js';

/**
 * Starts a comms session, launching the configured communication apps.
 *
 * @async
 * @param {Object} options - Command options
 * @param {string} [options.apps] - Comma-separated app names, overriding config `commsApps`
 * @param {string} [options.duration] - Optional window in minutes; omit to run until `focus stop`
 * @throws {Error} If validation fails or a session is already active
 * @returns {Promise<void>}
 */
export async function commsCommand(options) {
  const durationMinutes = parseDuration(options.duration);
  const config = loadConfig();
  const apps = resolveApps(options.apps, config.commsApps ?? config.defaultApps, 'commsApps');

  const session = await startSession({
    mode: 'comms',
    apps,
    durationMinutes,
    beforeSpawn: () => launchApps(apps, config.appAliases),
  });

  console.log('');
  showSuccess(
    durationMinutes
      ? `Comms mode on for ${durationMinutes} minute${durationMinutes !== 1 ? 's' : ''}.`
      : 'Comms mode on. Run `focus stop` when you are done.'
  );
  showStatus(session);
}

/**
 * Launches each app, warning about any that fail rather than aborting the session.
 * @private
 * @param {string[]} apps - App names to launch
 * @param {Object<string, string[]>} [aliases] - Extra aliases from config
 * @returns {void}
 */
function launchApps(apps, aliases) {
  for (const app of apps) {
    const { ok, error } = launchApp(app, aliases);
    if (!ok) showWarn(`Could not open "${app}": ${error}`);
  }
}
