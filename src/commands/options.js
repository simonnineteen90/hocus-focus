/**
 * Shared option parsing and validation for the session commands.
 * @module commands/options
 */

const MAX_APPS = 20;
const MIN_DURATION = 1;
const MAX_DURATION = 480;

/**
 * Parses and validates a duration in minutes.
 *
 * @param {string|undefined} value - Raw duration option
 * @param {Object} [options] - Parsing options
 * @param {boolean} [options.required] - When true, a missing value is an error; otherwise it yields null
 * @throws {Error} If the value is not a number within the allowed range
 * @returns {number|null} Duration in minutes, or null for an open-ended session
 */
export function parseDuration(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new Error('Duration is required.');
    return null;
  }

  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < MIN_DURATION || minutes > MAX_DURATION) {
    throw new Error(`Duration must be a whole number between ${MIN_DURATION} and ${MAX_DURATION} minutes.`);
  }

  return minutes;
}

/**
 * Resolves the app list from the `--apps` option, falling back to a configured list.
 *
 * @param {string|undefined} appsOption - Comma-separated app names from the command line
 * @param {string[]} [configured] - Fallback list from config
 * @param {string} configKey - Config key name, used in the error message
 * @throws {Error} If no apps are resolved or too many are supplied
 * @returns {string[]} Trimmed, non-empty app names
 */
export function resolveApps(appsOption, configured, configKey) {
  const apps = appsOption
    ? appsOption.split(',').map(a => a.trim()).filter(Boolean)
    : configured;

  if (!apps || apps.length === 0) {
    throw new Error(`No apps specified. Use --apps or set ${configKey} in your config file.`);
  }
  if (apps.length > MAX_APPS) {
    throw new Error(`Maximum of ${MAX_APPS} apps allowed.`);
  }

  return apps;
}
