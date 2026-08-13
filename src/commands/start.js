/**
 * Start command handler — block mode.
 * Validates inputs, terminates the blocked apps that are already running, then hands off to the
 * shared session runner to create the session and spawn the watcher daemon.
 * @module commands/start
 */

import { loadConfig } from '../config.js';
import { terminateApps } from '../apps.js';
import { startSession } from '../sessionRunner.js';
import { resolveApps, parseDuration } from './options.js';
import { showSuccess, showStatus } from '../display.js';

/**
 * Starts a focus session that blocks distracting apps for a fixed duration.
 *
 * @async
 * @param {Object} options - Command options
 * @param {string} [options.apps] - Comma-separated app names, overriding config `defaultApps`
 * @param {string} [options.duration] - Session length in minutes (1–480)
 * @throws {Error} If validation fails or a session is already active
 * @returns {Promise<void>}
 */
export async function startCommand(options) {
  const durationMinutes = parseDuration(options.duration, { required: true });
  const config = loadConfig();
  const apps = resolveApps(options.apps, config.defaultApps, 'defaultApps');

  const session = await startSession({
    mode: 'block',
    apps,
    durationMinutes,
    beforeSpawn: () => terminateApps(apps, { aliases: config.appAliases }),
  });

  console.log('');
  showSuccess(`Focus session started for ${durationMinutes} minute${durationMinutes !== 1 ? 's' : ''}.`);
  showStatus(session);
}
