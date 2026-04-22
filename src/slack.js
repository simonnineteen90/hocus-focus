/**
 * Slack API integration module.
 * Provides functions to get and set Slack custom status during focus sessions.
 * Uses Node.js built-in `https` module — no external dependencies.
 * Token is never logged or exposed in error output.
 * @module slack
 */

import https from 'https';

const SLACK_API_HOST = 'slack.com';
const SLACK_API_TIMEOUT_MS = 10_000;
const STATUS_TEXT_MAX_LENGTH = 100;
const DEFAULT_STATUS_TEMPLATE = '🎯 focusing back in {{duration}}';
const DURATION_PLACEHOLDER = '{{duration}}';

/**
 * Internal override for the https.request implementation.
 * Null means use the real `https.request`.
 * @type {Function|null}
 */
let _requestImpl = null;

/**
 * Override the https.request implementation for testing.
 * @param {Function} fn - Replacement function with the same signature as https.request
 */
export function _overrideHttpRequest(fn) {
  _requestImpl = fn;
}

/**
 * Restore the https.request implementation to the real built-in.
 */
export function _restoreHttpRequest() {
  _requestImpl = null;
}

/**
 * Makes an authenticated request to the Slack Web API.
 * Applies a 10-second timeout. Never exposes the token in thrown errors.
 *
 * @private
 * @param {{ method: string, path: string, token: string, body?: Object }} params
 * @returns {Promise<Object>} Parsed JSON response body
 * @throws {Error} On network error, timeout, non-2xx HTTP status, invalid JSON, or ok: false
 */
function slackRequest({ method, path, token, body }) {
  const requestFn = _requestImpl ?? https.request;
  const bodyJson = body !== undefined ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: SLACK_API_HOST,
      path,
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(bodyJson
          ? {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Length': Buffer.byteLength(bodyJson),
            }
          : {}),
      },
    };

    const req = requestFn(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => {
        raw += chunk;
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode > 299) {
          return reject(new Error(`Slack API returned HTTP ${res.statusCode}`));
        }
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return reject(new Error('Slack API returned invalid JSON'));
        }
        if (!parsed.ok) {
          return reject(new Error(`Slack API error: ${parsed.error ?? 'unknown'}`));
        }
        resolve(parsed);
      });
    });

    req.setTimeout(SLACK_API_TIMEOUT_MS, () => {
      req.destroy(new Error('Slack API request timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (bodyJson !== undefined) {
      req.write(bodyJson);
    }
    req.end();
  });
}

/**
 * Returns the Slack User OAuth Token from the environment or config.
 * Environment variable `SLACK_TOKEN` takes priority over `config.slack.token`.
 * Returns null when neither is present — the feature is silently skipped.
 *
 * @param {Object} [config] - Application configuration object
 * @returns {string|null} Slack token or null if not configured
 */
export function getSlackToken(config) {
  return process.env.SLACK_TOKEN ?? config?.slack?.token ?? null;
}

/**
 * Gets the current Slack custom status for the authenticated user.
 *
 * @param {string} token - Slack User OAuth Token
 * @returns {Promise<{ statusText: string, statusEmoji: string, statusExpiration: number }>}
 * @throws {Error} On API error
 */
export async function getStatus(token) {
  const data = await slackRequest({
    method: 'GET',
    path: '/api/users.profile.get',
    token,
  });
  const profile = data.profile ?? {};
  return {
    statusText: profile.status_text ?? '',
    statusEmoji: profile.status_emoji ?? '',
    statusExpiration: profile.status_expiration ?? 0,
  };
}

/**
 * Sets the Slack custom status for the authenticated user.
 *
 * @param {string} token - Slack User OAuth Token
 * @param {{ statusText: string, statusEmoji: string, statusExpiration: number }} params
 * @returns {Promise<void>}
 * @throws {Error} On API error
 */
export async function setStatus(token, { statusText, statusEmoji, statusExpiration }) {
  await slackRequest({
    method: 'POST',
    path: '/api/users.profile.set',
    token,
    body: {
      profile: {
        status_text: statusText,
        status_emoji: statusEmoji,
        status_expiration: statusExpiration,
      },
    },
  });
}

/**
 * Clears the Slack custom status for the authenticated user.
 *
 * @param {string} token - Slack User OAuth Token
 * @returns {Promise<void>}
 * @throws {Error} On API error
 */
export function clearStatus(token) {
  return setStatus(token, { statusText: '', statusEmoji: '', statusExpiration: 0 });
}

/**
 * Formats a duration in minutes into a compact human-readable string.
 * Examples: 0 -> "0m", 45 -> "45m", 60 -> "1h", 90 -> "1h 30m", 480 -> "8h"
 *
 * @param {number} minutes - Duration in whole minutes
 * @returns {string} Human-readable duration
 */
export function formatDuration(minutes) {
  if (minutes === 0) return '0m';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const parts = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.join(' ');
}

/**
 * Interpolates `{{duration}}` into a Slack status text template.
 * Falls back to the default template when the provided value is empty or falsy.
 * Output is trimmed and capped at 100 characters.
 *
 * @param {string|null|undefined} template - Status text template
 * @param {number} durationMinutes - Session duration in minutes
 * @returns {string} Interpolated status text (max 100 chars)
 */
export function interpolateStatusText(template, durationMinutes) {
  const tmpl = template || DEFAULT_STATUS_TEMPLATE;
  const result = tmpl.replace(DURATION_PLACEHOLDER, formatDuration(durationMinutes)).trim();
  return result.slice(0, STATUS_TEXT_MAX_LENGTH);
}

/**
 * Restores a previously saved Slack status, or clears it when appropriate.
 *
 * Rules applied in order:
 * 1. Both previousText and previousEmoji empty -> clearStatus
 * 2. previousExpiration is set and has already passed -> clearStatus
 * 3. Otherwise -> setStatus with the saved values
 *
 * @param {string} token - Slack User OAuth Token
 * @param {{ previousText: string, previousEmoji: string, previousExpiration: number }} slackStatus
 * @returns {Promise<void>}
 * @throws {Error} On API error
 */
export async function restoreSlackStatus(token, slackStatus) {
  const { previousText, previousEmoji, previousExpiration } = slackStatus;

  if (!previousText && !previousEmoji) {
    return clearStatus(token);
  }

  const nowSecs = Math.floor(Date.now() / 1000);
  if (previousExpiration > 0 && previousExpiration <= nowSecs) {
    return clearStatus(token);
  }

  return setStatus(token, {
    statusText: previousText,
    statusEmoji: previousEmoji,
    statusExpiration: previousExpiration,
  });
}
