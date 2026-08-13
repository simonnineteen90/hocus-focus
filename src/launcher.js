/**
 * Application launcher module.
 *
 * Used by comms mode to open the apps a focus session would normally block.
 * Launching is best-effort: a failure to open one app never prevents the others from opening,
 * and never fails the session.
 *
 * @module launcher
 */

import { execFileSync } from 'child_process';
import { aliasesFor } from './appMatch.js';

/**
 * Launches an application by its user-facing name.
 *
 * The configured short name is often not what the launcher expects — `open -a Teams` fails because the
 * bundle is called "Microsoft Teams" — so each known alias is tried in turn until one works.
 *
 * @param {string} appName - User-facing app name (e.g., 'Teams')
 * @param {Object<string, string[]>} [aliases] - Extra aliases keyed by app name, from config
 * @returns {{ok: boolean, error?: string}} Result indicating whether the launch succeeded
 */
export function launchApp(appName, aliases = {}) {
  const name = String(appName ?? '').trim();
  if (!name) return { ok: false, error: 'Empty app name' };

  let lastError = 'no launchable name found';

  for (const candidate of launchCandidates(name, aliases)) {
    const result = process.platform === 'darwin' ? launchDarwin(candidate) : launchLinux(candidate);
    if (result.ok) return result;
    lastError = result.error;
  }

  return { ok: false, error: lastError };
}

/**
 * Builds the ordered list of names to try when launching an app.
 * The configured name comes first, then its aliases. Reverse-DNS identifiers are excluded because
 * they name helper processes rather than launchable applications.
 * @private
 * @param {string} name - Configured app name
 * @param {Object<string, string[]>} aliases - Extra aliases from config
 * @returns {string[]} Candidate names, most preferred first
 */
function launchCandidates(name, aliases) {
  const candidates = [name];

  for (const alias of aliasesFor(name, aliases)) {
    if (alias.includes('.')) continue;
    if (alias.toLowerCase() === name.toLowerCase()) continue;
    candidates.push(alias);
  }

  return candidates;
}

/**
 * Launches an app on macOS via `open -a`, which matches bundle names case-insensitively.
 * @private
 * @param {string} name - Candidate app name
 * @returns {{ok: boolean, error?: string}} Launch result
 */
function launchDarwin(name) {
  try {
    execFileSync('open', ['-a', name], { stdio: 'ignore' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Could not launch "${name}": ${e.message}` };
  }
}

/**
 * Launches an app on Linux, trying the plain binary before falling back to a desktop entry.
 * @private
 * @param {string} name - User-facing app name
 * @returns {{ok: boolean, error?: string}} Launch result
 */
function launchLinux(name) {
  const binary = name.toLowerCase().replace(/\s+/g, '-');

  try {
    execFileSync('sh', ['-c', `command -v ${JSON.stringify(binary)} >/dev/null 2>&1`], { stdio: 'ignore' });
    execFileSync('sh', ['-c', `${JSON.stringify(binary)} >/dev/null 2>&1 &`], { stdio: 'ignore' });
    return { ok: true };
  } catch {
    // Binary not on PATH — fall through to the desktop-entry launcher.
  }

  try {
    execFileSync('gtk-launch', [`${binary}.desktop`], { stdio: 'ignore' });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: `Could not launch "${name}": ${e.message}` };
  }
}
