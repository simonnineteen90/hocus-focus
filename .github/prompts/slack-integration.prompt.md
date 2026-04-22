# Slack Status Integration — Implementation Prompt

## Feature Overview

When `focus start` is run, automatically set the user's Slack custom status to a message such as:

> 🎯 focusing back in 45m

When the session ends (either via timer expiry or `focus stop`), restore the user's previous Slack status, including its original expiration.

---

## Slack API

### Set status
```
POST https://slack.com/api/users.profile.set
Authorization: Bearer xoxp-...
Content-Type: application/json

{
  "profile": {
    "status_text": "focusing back in 45m",
    "status_emoji": ":technologist:",
    "status_expiration": 1714000000
  }
}
```

`status_expiration` is a Unix timestamp (seconds). Passing `0` means no expiration. Slack auto-clears the status at this time — even if the watcher crashes.

### Get current status (to save before overriding)
```
GET https://slack.com/api/users.profile.get
Authorization: Bearer xoxp-...
```
Response contains `profile.status_text`, `profile.status_emoji`, `profile.status_expiration`.

### Clear status
Pass `status_text: ""` and `status_emoji: ""` to `users.profile.set`.

### Token
Requires a **user token** (`xoxp-...`) with scopes:
- `users.profile:write`
- `users.profile:read`

---

## Configuration

Add an optional `slack` block to `~/.focus/config.json`:

```json
{
  "defaultApps": ["Slack", "Teams", "Discord"],
  "confirmationDelaySecs": 10,
  "slack": {
    "token": "xoxp-...",
    "statusText": "🎯 focusing back in {{duration}}",
    "statusEmoji": ":technologist:",
    "restoreStatusOnStop": true
  }
}
```

### Token resolution (highest priority first)
1. `SLACK_TOKEN` environment variable
2. `config.slack.token`
3. If absent → Slack integration silently skipped (fully opt-in)

### Template variables
- `{{duration}}` → human-readable session length: `45m`, `1h 30m`, `1h`
- Resulting string is trimmed and capped at 100 characters (Slack's status text limit)

---

## Session Schema Addition

Add an optional `slackStatus` field to `session.json`. **`set` is only set to `true` after a successful `setStatus` call** — never on failure.

```json
{
  "slackStatus": {
    "previousText": "in a meeting",
    "previousEmoji": ":calendar:",
    "previousExpiration": 1714000000,
    "set": true
  }
}
```

- `previousExpiration` is persisted so restore can honour the original expiry or detect it has already passed.
- After a successful restore, clear `slackStatus` from the session (write `slackStatus: null`) to prevent double-restore.

---

## Files to Create/Modify

### New: `src/slack.js`

Pure async functions using Node.js built-in `https` module (no new npm dependencies).

#### Internal: `slackRequest({ method, path, token, body })`
Shared HTTP helper:
- Opens `https.request` to `slack.com`
- Sets `Authorization: Bearer <token>`, `Content-Type: application/json`
- Applies a **10-second request timeout** (destroys socket on timeout)
- Collects response body, handles JSON parse failures gracefully
- Throws descriptive `Error` on: network/timeout, non-2xx HTTP status, invalid JSON, Slack `ok: false` (includes the Slack `error` field)
- **Never logs the token or Authorization header**

#### Public exports

| Export | Description |
|---|---|
| `getSlackToken(config)` | Returns token from `SLACK_TOKEN` env or `config.slack.token`, else `null` |
| `getStatus(token)` | Calls `users.profile.get`; returns `{ statusText, statusEmoji, statusExpiration }` |
| `setStatus(token, { statusText, statusEmoji, statusExpiration })` | Calls `users.profile.set` |
| `clearStatus(token)` | Calls `setStatus` with empty `status_text`/`status_emoji` and `status_expiration: 0` |
| `interpolateStatusText(template, durationMinutes)` | Replaces `{{duration}}`, trims, caps at 100 chars. Falls back to `"focusing back in {{duration}}"` if template is empty/falsy |
| `formatDuration(minutes)` | Returns `"1m"`, `"45m"`, `"1h"`, `"1h 30m"`, `"8h"` etc. Handles `0` → `"0m"` |

All API functions throw descriptive `Error` on non-OK responses or `ok: false`.

---

### Modified: `src/commands/start.js`

After watcher handshake is confirmed and before `showSuccess`:

1. Resolve token via `getSlackToken(config)` — skip entire block if `null`
2. Call `getStatus(token)` → capture `previousText`, `previousEmoji`, `previousExpiration`
3. Build status: interpolate `config.slack?.statusText` (default `"🎯 focusing back in {{duration}}"`), use `config.slack?.statusEmoji` (default `":technologist:"`), set `statusExpiration = Math.floor(new Date(endsAt).getTime() / 1000)`
4. Call `setStatus(...)` — **only on success**: update session with `slackStatus = { previousText, previousEmoji, previousExpiration, set: true }`
5. Atomic session re-write with `slackStatus` populated
6. **Non-fatal:** entire Slack block in `try/catch`; `showWarn(...)` on error; session start proceeds regardless

---

### Modified: `src/commands/stop.js`

After watcher is stopped and before `showSuccess`:

1. Skip if `!session.slackStatus?.set`
2. Skip if `config.slack?.restoreStatusOnStop === false`
3. Resolve token via `getSlackToken(config)` — skip if `null`
4. **Restore logic:**
   - If `previousText` and `previousEmoji` are both empty → `clearStatus`
   - Else if `previousExpiration` is set and `previousExpiration <= Math.floor(Date.now() / 1000)` → `clearStatus` (original status has already expired)
   - Else → `setStatus` with `{ previousText, previousEmoji, previousExpiration }`
5. On success or failure: write `slackStatus: null` to session and atomically persist (prevents double-restore)
6. **Non-fatal:** wrap in `try/catch`; `showWarn(...)` on error

---

### Modified: `src/watcher.js`

In the `cleanup('timer expired')` path **only** (not on SIGTERM/SIGINT — stop command handles that):

1. Read `session.slackStatus`
2. Skip if `!slackStatus?.set`
3. Resolve token via `getSlackToken(loadConfig())` — checks env **then** config (watcher must load config, not rely on env alone)
4. Apply same restore logic as `stop.js` (extract to shared helper or duplicate clearly)
5. On success or failure: set `slackStatus: null` in session and persist atomically
6. Log result via `log()` (no token in log messages)
7. **Non-fatal:** errors are caught and logged; cleanup proceeds regardless

---

### Modified: `example.config.json`

```json
{
  "defaultApps": ["Slack", "Teams", "Discord"],
  "confirmationDelaySecs": 10,
  "slack": {
    "token": "xoxp-your-token-here",
    "statusText": "🎯 focusing back in {{duration}}",
    "statusEmoji": ":technologist:",
    "restoreStatusOnStop": true
  }
}
```

---

### New: `test/unit/slack.test.js`

Unit tests — **no real network calls**, mock `https.request`:

**`formatDuration`**
- `0` → `"0m"`
- `1` → `"1m"`
- `45` → `"45m"`
- `60` → `"1h"`
- `90` → `"1h 30m"`
- `120` → `"2h"`
- `480` → `"8h"`

**`interpolateStatusText`**
- Substitutes `{{duration}}` correctly
- Falls back to default template when input is empty/null
- Caps output at 100 characters
- Passes through text with no `{{duration}}` unchanged

**`getSlackToken`**
- Returns `SLACK_TOKEN` env var when set (takes priority over config)
- Returns `config.slack.token` when env absent
- Returns `null` when neither present

**`setStatus` / `getStatus` (mocked `https.request`)**
- Asserts correct endpoint, HTTP method, `Authorization` header, JSON body
- Handles `ok: false` Slack error response → throws with Slack error code
- Handles non-2xx HTTP → throws with status code
- Handles timeout → throws descriptive error
- Handles invalid JSON response → throws

**Behaviour tests**
- No Slack calls made when token is absent
- Slack failure in `start` flow is non-fatal (session still created)
- `restoreStatusOnStop: false` skips restore in stop flow
- Previous status with expired `previousExpiration` → `clearStatus` called instead of `setStatus`

---

### Modified: `README.md`

Add a new **Slack Integration** section:
1. How to create a Slack app at https://api.slack.com/apps
2. Required OAuth scopes: `users.profile:write`, `users.profile:read`
3. Installing to workspace and copying the User OAuth Token
4. Token setup: `SLACK_TOKEN` env var (recommended — keeps token out of config file) or `config.slack.token`
5. Security note: avoid storing token in shell history; prefer env var via a secrets manager or `.env` file (not committed)
6. Config options table with defaults
7. Template syntax and `{{duration}}` variable
8. Behaviour note: status auto-expires via Slack's `status_expiration` even if session isn't stopped cleanly

---

## Constraints

- **No new npm dependencies** — use Node.js built-in `https` for API calls
- **Fully opt-in** — if no token is configured, the feature is silently skipped
- **Non-fatal** — Slack API errors must never crash or block the focus session
- **ESM** — all new code uses `import`/`export`
- **Token safety** — token must never appear in log files or test output
- **Restore fidelity** — `previousExpiration` is always persisted and honoured on restore; expired prior statuses are cleared rather than incorrectly re-applied
- **State correctness** — `set: true` is only written after a confirmed successful `setStatus`; `slackStatus` is cleared after restore to prevent double-restore
