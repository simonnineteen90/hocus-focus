# focus — distraction blocker

A lightweight CLI tool for macOS and Linux that blocks distracting desktop applications for a set period. A background watcher daemon monitors and terminates blocked apps for the duration, even after the terminal is closed.

---

## Prerequisites

- **Node.js 18+**
- macOS or Linux
- The `ps` command (standard on both platforms)

---

## Installation

```bash
git clone https://github.com/simonnineteen90/distraction-blocker.git
cd distraction-blocker
npm install
npm install -g .       # installs `focus` globally
```

---

## Usage

### Start a session

```bash
# Block default apps (Slack, Teams, Discord) for 25 minutes
focus start

# Block specific apps for 45 minutes
focus start --apps "Slack,Teams" --duration 45
```

| Flag | Default | Description |
|------|---------|-------------|
| `--apps` | config `defaultApps` | Comma-separated app names to block |
| `--duration` | `25` | Session length in minutes (1–480) |

### Check status

```bash
focus status
```

### Stop a session

```bash
focus stop            # 10-second confirmation countdown (Ctrl+C to cancel)
focus stop --force    # stop immediately
```

---

## Configuration

| Platform | Config path |
|----------|-------------|
| macOS | `~/.focus/config.json` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/focus/config.json` |

```json
{
  "defaultApps": ["Slack", "Teams", "Discord"],
  "confirmationDelaySecs": 10
}
```

See `example.config.json` for a reference.

---

## Slack Integration

When a focus session starts, hocus-focus can automatically set your Slack custom status (e.g. *🎯 focusing back in 45m*) and restore your previous status when the session ends.

### Setup

1. Go to [https://api.slack.com/apps](https://api.slack.com/apps) and create a new app (from scratch, in your workspace).
2. Under **OAuth & Permissions → Scopes**, add these **User Token Scopes**:
   - `users.profile:write`
   - `users.profile:read`
3. Click **Install to Workspace** and authorise. Copy the **User OAuth Token** (starts with `xoxp-`).

### Token configuration

**Recommended — environment variable** (keeps token out of config files):

```bash
export SLACK_TOKEN=xoxp-your-token-here
```

Add to your shell profile (`.zshrc`, `.bashrc`, etc.) or manage via a secrets tool. Avoid pasting the token directly into your shell history.

**Alternative — config file:**

Add a `slack.token` field to your config file (see below). Be careful not to commit this file.

### Config options

| Option | Default | Description |
|--------|---------|-------------|
| `slack.token` | — | User OAuth Token (`xoxp-…`). Ignored if `SLACK_TOKEN` env var is set. |
| `slack.statusText` | `"🎯 focusing back in {{duration}}"` | Status text template. Use `{{duration}}` for the session length. |
| `slack.statusEmoji` | `":technologist:"` | Slack emoji code for the status icon. |
| `slack.restoreStatusOnStop` | `true` | Restore previous status on `focus stop`. Set to `false` to leave status as-is. |

### Template variable

`{{duration}}` is replaced with a human-readable session length: `1m`, `45m`, `1h`, `1h 30m`, etc.

### Behaviour notes

- **Fully opt-in** — if no token is configured the feature is silently skipped.
- **Non-fatal** — a Slack API error will show a warning but will never block or crash your focus session.
- **Auto-expiry** — hocus-focus sets `status_expiration` on Slack's side. Even if the session ends uncleanly (machine sleep, crash), Slack will auto-clear the status at the right time.
- **Restore fidelity** — your previous status expiration is saved and honoured on restore. If it has already passed by the time the session ends, the status is cleared rather than incorrectly re-applied.

---

## Log file

| Platform | Log path |
|----------|----------|
| macOS | `~/.focus/focus.log` |
| Linux | `${XDG_STATE_HOME:-~/.local/state}/focus/focus.log` |

---

## Running tests

```bash
npm test
```

Uses Node.js built-in `node:test` — no extra framework needed. Integration tests are skipped automatically on unsupported platforms.

---

## Permissions note

`focus` sends SIGTERM/SIGKILL to processes owned by the current user. `sudo` is not required.
