# hocus focus — distraction blocker

A lightweight CLI tool for macOS and Linux with two modes:

- **Focus mode** (`focus start`) blocks distracting apps for a set period. A background watcher daemon monitors and terminates them for the duration, even after the terminal is closed.
- **Comms mode** (`focus comms`) does the opposite: it opens your communication apps so you can catch up, optionally closing them again after a set time.

Only one session can be active at a time.

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

### Focus mode — block distractions

```bash
# Block default apps (Slack, Teams) for 25 minutes
focus start

# Block specific apps for 45 minutes
focus start --apps "Slack,Teams" --duration 45
```

| Flag | Default | Description |
|------|---------|-------------|
| `--apps` | config `defaultApps` | Comma-separated app names to block |
| `--duration` | `25` | Session length in minutes (1–480) |

Outlook is **not** blocked by default, so meeting reminders still reach you during a focus session.

### Comms mode — open everything

```bash
# Open your comms apps and leave them open until you stop
focus comms

# Open them for a 20-minute catch-up, then close them automatically
focus comms --duration 20

# Open a specific set of apps
focus comms --apps "Slack,Teams,Outlook" --duration 15
```

| Flag | Default | Description |
|------|---------|-------------|
| `--apps` | config `commsApps` | Comma-separated app names to open |
| `--duration` | none | Optional. Minutes (1–480) before the apps are closed automatically. Omit to run until `focus stop` |

Comms mode launches each app once — it does not fight you or relaunch anything mid-session. When the
timer expires (or you run `focus stop`) the apps are quit and the tool goes idle.

### Check status

```bash
focus status
```

### Stop a session

```bash
focus stop            # 10-second confirmation countdown (Ctrl+C to cancel)
focus stop --force    # stop immediately
```

The countdown applies to focus sessions only — ending comms mode stops immediately, since that means
getting back to work.

---

## Configuration

| Platform | Config path |
|----------|-------------|
| macOS | `~/.focus/config.json` |
| Linux | `${XDG_CONFIG_HOME:-~/.config}/focus/config.json` |

```json
{
  "defaultApps": ["Slack", "Teams"],
  "commsApps": ["Slack", "Teams", "Outlook"],
  "appAliases": {
    "teams": ["microsoft teams", "msteams"]
  },
  "confirmationDelaySecs": 10
}
```

| Key | Description |
|-----|-------------|
| `defaultApps` | Apps blocked by `focus start` |
| `commsApps` | Apps opened by `focus comms` |
| `appAliases` | Extra process/bundle names identifying an app, merged with the built-in aliases |
| `confirmationDelaySecs` | Countdown before a focus session is stopped |

See `example.config.json` for a reference.

### How apps are matched

App names rarely match their executables. Microsoft Teams ships a binary called `MSTeams`, and Outlook's
is `Microsoft Outlook`, so simple name matching misses them entirely. `focus` matches a process when
either its executable name **or** any `.app` bundle in its path matches the app name or one of its
aliases. This also catches helper, renderer and agent processes, which would otherwise keep running
and relaunch the app.

If an app of yours isn't matched, add its process or bundle name under `appAliases`.

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
