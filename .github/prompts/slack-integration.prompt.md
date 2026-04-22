# Slack Status Integration — Implementation Prompt

## Feature Overview

When `focus start` is run, automatically set the user's Slack custom status to a message such as:

> 🎯 focusing back in 45m

When the session ends (either via timer expiry or `focus stop`), restore the user's previous Slack status.

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

`status_expiration` is a Unix timestamp (seconds). Slack auto-clears the status at this time — even if the watcher crashes.

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
    "statusText": "focusing back in {{duration}}",
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

---

## Session Schema Addition

Add an optional `slackStatus` field to `session.json` to persist the previous status for restore:

```json
{
  "slackStatus": {
    "previousText": "in a meeting",
    "previousEmoji": ":calendar:",
    "set": true
  }
}
```

---

## Files to Create/Modify

### New: `src/slack.js`
Pure async functions using Node.js built-in `https` module (no new npm dependencies):

| Export | Description |
|---|---|
| `getSlackToken(config)` | Returns token from `SLACK_TOKEN` env or `config.slack.token`, else `null` |
| `getStatus(token)` | Calls `users.profile.get`, returns `{ statusText, statusEmoji, statusExpiration }` |
| `setStatus(token, { statusText, statusEmoji, statusExpiration })` | Calls `users.profile.set` |
| `clearStatus(token)` | Sets empty `status_text` and `status_emoji` |
| `interpolateStatusText(template, durationMinutes)` | Replaces `{{duration}}` with `formatDuration(durationMinutes)` |
| `formatDuration(minutes)` | Returns `"45m"`, `"1h 30m"`, `"1h"` etc. |

All API functions should throw a descriptive `Error` on non-OK responses or API `ok: false`.

### Modified: `src/commands/start.js`
After watcher handshake is confirmed and before `showSuccess`:
1. Call `getSlackToken(config)` — skip if null
2. Call `getStatus(token)` → save `previousText`, `previousEmoji` to `session.slackStatus`
3. Call `setStatus(token, { statusText: interpolated, statusEmoji, statusExpiration: Math.floor(new Date(endsAt).getTime() / 1000) })`
4. Set `session.slackStatus.set = true`
5. Re-write session with `slackStatus` populated
6. **Non-fatal:** wrap in try/catch, `showWarn(...)` on error — session still starts

### Modified: `src/commands/stop.js`
After watcher is stopped and before `showSuccess`:
1. Check `session.slackStatus?.set`
2. Resolve token — skip if null
3. Check `config.slack?.restoreStatusOnStop !== false`
4. If previous status was non-empty: call `setStatus` to restore; else call `clearStatus`
5. **Non-fatal:** wrap in try/catch, `showWarn(...)` on error

### Modified: `src/watcher.js`
In the `cleanup('timer expired')` path only:
1. Read `session.slackStatus`
2. Resolve token from `process.env.SLACK_TOKEN` (watcher inherits env from start command)
3. If `slackStatus?.set`: restore previous status via `setStatus`/`clearStatus`
4. Log success or error via `log()`
5. **Non-fatal:** catch errors and log; cleanup proceeds regardless

### Modified: `example.config.json`
Add the slack block with all options documented:

```json
{
  "defaultApps": ["Slack", "Teams", "Discord"],
  "confirmationDelaySecs": 10,
  "slack": {
    "token": "xoxp-your-token-here",
    "statusText": "focusing back in {{duration}}",
    "statusEmoji": ":technologist:",
    "restoreStatusOnStop": true
  }
}
```

### New: `test/unit/slack.test.js`
Unit tests (no network calls — mock `https.request`):

- `formatDuration(45)` → `"45m"`
- `formatDuration(60)` → `"1h"`
- `formatDuration(90)` → `"1h 30m"`
- `formatDuration(1)` → `"1m"`
- `formatDuration(480)` → `"8h"`
- `interpolateStatusText("focusing back in {{duration}}", 45)` → `"focusing back in 45m"`
- `interpolateStatusText("back at {{duration}}", 90)` → `"back at 1h 30m"`
- `interpolateStatusText("no variable", 30)` → `"no variable"`
- `getSlackToken({ slack: { token: "xoxp-abc" } })` → `"xoxp-abc"`
- `getSlackToken({})` → `null`
- `SLACK_TOKEN` env var takes priority over config
- Mocked `setStatus` / `getStatus` — assert correct JSON body and headers sent

### Modified: `README.md`
Add a new **Slack Integration** section documenting:
1. How to create a Slack app at https://api.slack.com/apps
2. Required OAuth scopes: `users.profile:write`, `users.profile:read`
3. Installing the app to the workspace and copying the User OAuth Token
4. Setting the token: via `SLACK_TOKEN` env var or `config.slack.token`
5. Available config options with defaults
6. Template syntax and `{{duration}}` variable
7. Note: status auto-expires via Slack even if the session isn't stopped cleanly

---

## Constraints

- **No new npm dependencies** — use Node.js built-in `https` for API calls
- **Fully opt-in** — if no token is configured, the feature is silently skipped
- **Non-fatal** — Slack API errors must never crash or block the focus session
- **ESM** — all new code uses `import`/`export`
- Token must never be logged (pass to logger only on error if needed, redact it)
