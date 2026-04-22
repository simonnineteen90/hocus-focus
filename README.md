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
