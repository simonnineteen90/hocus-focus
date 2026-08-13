/**
 * Configuration module.
 * Loads focus session configuration from a JSON file in the config directory.
 * Merges user config with built-in defaults; creates config file with defaults if missing.
 * @module config
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getPaths } from './paths.js';

const DEFAULTS = {
  // Outlook is deliberately absent: it stays open during focus sessions so meeting reminders still fire.
  defaultApps: ['Slack', 'Teams'],
  commsApps: ['Slack', 'Teams', 'Outlook'],
  appAliases: {},
  confirmationDelaySecs: 10,
};

/**
 * Loads or initializes the focus configuration.
 * Reads config.json from the config directory. If not found, creates it with built-in defaults.
 * Returns a merged object: defaults are overridden by values from config.json if present.
 * If config file is malformed, silently returns defaults (graceful degradation).
 * 
 * @returns {Object} Configuration object with properties: defaultApps (array), commsApps (array),
 *   appAliases (object), confirmationDelaySecs (number)
 */
export function loadConfig() {
  const { configFile } = getPaths();

  if (!existsSync(configFile)) {
    writeFileSync(configFile, JSON.stringify(DEFAULTS, null, 2), { mode: 0o600 });
    return { ...DEFAULTS };
  }

  try {
    const raw = readFileSync(configFile, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}
