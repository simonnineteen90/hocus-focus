/**
 * Application matching module.
 *
 * Matching a user-friendly app name (e.g. "Teams") against running processes is not as simple as
 * comparing executable names. On macOS the Microsoft Teams executable is `MSTeams` and Outlook's is
 * `Microsoft Outlook`, so a naive leaf-name comparison never matches. Electron apps additionally spawn
 * helper, renderer and agent processes that must be terminated too, otherwise the app relaunches or
 * keeps delivering notifications.
 *
 * This module matches on two axes:
 *   1. the normalised leaf executable name, and
 *   2. the name of any `.app` bundle appearing in the process's full command path.
 *
 * Both are compared against the target name plus a table of known aliases.
 *
 * @module appMatch
 */

/**
 * Built-in aliases keyed by normalised app name.
 * Values are alternative normalised names that identify the same application.
 */
const BUILT_IN_ALIASES = {
  teams: ['microsoft teams', 'msteams', 'teams', 'com.microsoft.teams2'],
  outlook: ['microsoft outlook', 'outlook'],
  slack: ['slack'],
  discord: ['discord'],
  whatsapp: ['whatsapp'],
  signal: ['signal'],
  telegram: ['telegram', 'telegram desktop'],
};

/** Targets shorter than this are rejected as too broad to match safely. */
const MIN_TARGET_LENGTH = 3;

/**
 * Lowercases and trims a value, returning an empty string for non-strings.
 * @private
 * @param {*} value - Value to clean
 * @returns {string} Lowercased, trimmed string
 */
function clean(value) {
  return typeof value === 'string' ? value.toLowerCase().trim() : '';
}

/**
 * Builds the full set of normalised names that identify an app.
 * Combines the target itself with built-in aliases and any user-supplied aliases from config.
 *
 * @param {string} appName - User-facing app name (e.g. 'Teams')
 * @param {Object<string, string[]>} [userAliases] - Extra aliases keyed by app name, from config
 * @returns {Set<string>} Set of normalised identifiers for the app
 */
export function aliasesFor(appName, userAliases = {}) {
  const target = clean(appName)
    .replace(/\.app$/i, '')
    .replace(/\.exe$/i, '');

  const names = new Set();
  if (target) names.add(target);

  for (const alias of BUILT_IN_ALIASES[target] ?? []) {
    names.add(clean(alias));
  }

  for (const [key, values] of Object.entries(userAliases)) {
    if (clean(key) !== target || !Array.isArray(values)) continue;
    for (const alias of values) {
      const cleaned = clean(alias);
      if (cleaned) names.add(cleaned);
    }
  }

  return names;
}

/**
 * Extracts the normalised names of every `.app` bundle in a command path.
 * For `/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams` this yields `['microsoft teams']`.
 * Nested helper bundles yield multiple entries, e.g. `Slack.app` and `Slack Helper.app`.
 *
 * @param {string} command - Full command path of a process
 * @returns {string[]} Normalised bundle names, outermost first
 */
export function bundleNames(command) {
  const cleaned = clean(command);
  if (!cleaned) return [];

  return cleaned
    .split('/')
    .filter(segment => segment.endsWith('.app'))
    .map(segment => segment.slice(0, -'.app'.length).trim())
    .filter(Boolean);
}

/**
 * Tests whether a running process belongs to the named application.
 * Matches when the process's normalised leaf name, or any `.app` bundle in its command path,
 * equals the app name or one of its aliases.
 *
 * @param {{name: string, command?: string}} proc - Process with normalised name and full command path
 * @param {string} appName - User-facing app name to match against
 * @param {Object<string, string[]>} [userAliases] - Extra aliases keyed by app name, from config
 * @returns {boolean} True if the process belongs to the app
 */
export function matchesApp(proc, appName, userAliases = {}) {
  const names = aliasesFor(appName, userAliases);
  if (names.size === 0) return false;

  // Refuse to match on very short targets — they are too likely to catch unrelated processes.
  const shortest = Math.min(...[...names].map(n => n.length));
  if (shortest < MIN_TARGET_LENGTH) return false;

  const leaf = clean(proc?.name);
  if (leaf && names.has(leaf)) return true;

  // A reverse-DNS process name such as `com.microsoft.teams2.respawn` belongs to the app when it is
  // prefixed by one of the aliases.
  if (leaf && [...names].some(n => n.includes('.') && leaf.startsWith(n + '.'))) return true;

  return bundleNames(proc?.command).some(bundle => names.has(bundle));
}
