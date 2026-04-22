# Distraction Blocker: A Beginner's Guide to Node CLI Apps

This guide explains how Node.js command-line applications work, using **distraction-blocker** as a concrete teaching example. If you're new to Node CLI apps or wondering how this service actually works under the hood, this is for you.

---

## Table of Contents

1. [Node CLI Basics](#node-cli-basics)
2. [Anatomy of a Node CLI App](#anatomy-of-a-node-cli-app)
3. [How Distraction-Blocker Works](#how-distraction-blocker-works)
4. [The Detached Daemon Pattern](#the-detached-daemon-pattern)
5. [File-Based IPC (Inter-Process Communication)](#file-based-ipc)
6. [Process Signals and Graceful Shutdown](#process-signals-and-graceful-shutdown)
7. [Cross-Platform Considerations](#cross-platform-considerations)
8. [Debugging Tips](#debugging-tips)
9. [Common Pitfalls](#common-pitfalls)

---

## Node CLI Basics

### What is a Node CLI App?

A **CLI (Command-Line Interface)** application is a program you run from a terminal without a graphical interface. Examples: `npm`, `git`, `focus`.

Node.js makes it easy to build CLI apps because:
- **Node has process APIs** to interact with the OS (signals, exit codes, environment variables)
- **NPM packages** handle argument parsing, colors, and user interaction
- **ES Modules** let you organize code cleanly (imports/exports)

### The Shebang Line

Open `bin/focus` and look at the first line:

```bash
#!/usr/bin/env node
```

This is a **shebang**. It tells the OS: "When someone runs this file, execute it with the `node` command."

Without this line, the OS wouldn't know to interpret the file as JavaScript. With it, you can run:

```bash
./bin/focus start  # Works! Shebang tells OS to use node
```

Instead of:

```bash
node bin/focus start  # Still works, but less convenient
```

### The `bin` Mapping in package.json

Look at `package.json`:

```json
{
  "bin": {
    "focus": "./bin/focus"
  }
}
```

This tells npm: "When someone installs this package globally (`npm install -g distraction-blocker`), create a command called `focus` that runs `bin/focus`."

So after installation:

```bash
npm install -g distraction-blocker
focus start  # Now available as a global command
```

npm automatically:
1. Copies `bin/focus` to `/usr/local/bin/focus` (on macOS/Linux)
2. Adds the shebang so it's executable
3. Makes it available in your `$PATH`

---

## Anatomy of a Node CLI App

### 1. Entry Point (`bin/focus`)

This is the file that runs first. It imports the command handlers and sets up routing:

```javascript
import { program } from 'commander';
import { startCommand } from '../src/commands/start.js';

program
  .command('start')
  .option('--duration <minutes>', 'Session duration in minutes', '25')
  .action(async (options) => {
    try {
      await startCommand(options);
    } catch (e) {
      showError(e.message);
      process.exitCode = 1;  // Signal failure to the shell
    }
  });

program.parse();  // Parse process.argv and route to handlers
```

**Key concepts:**
- `commander` library handles argument parsing (turns CLI args into a structured `options` object)
- `.command()` defines sub-commands (`focus start`, `focus stop`, etc.)
- `.action()` is the handler that runs when that command is invoked
- `process.exitCode = 1` tells the shell that the command failed (exit code 0 = success, non-zero = failure)

### 2. Command Handlers (`src/commands/start.js`, etc.)

Each handler is an async function that does the actual work:

```javascript
export async function startCommand(options) {
  // Validate inputs
  // Acquire lock (ensure singleton)
  // Spawn watcher
  // Wait for handshake
  // Display success
}
```

Handlers are **not** CLI-specific code—they're business logic that could be imported and used programmatically. They throw errors if something goes wrong; the CLI catches and displays them.

### 3. Core Modules (`src/*.js`)

Supporting modules handle cross-cutting concerns:
- `lock.js` — filesystem-based locks (prevents concurrent sessions)
- `session.js` — state persistence (reads/writes session JSON)
- `process.js` — process discovery and termination
- `paths.js` — platform-aware directory resolution
- `config.js` — user configuration

These modules know nothing about CLI output—they work with data structures. The CLI can display them however it wants.

---

## How Distraction-Blocker Works

Let's trace what happens when you run `focus start --apps Slack --duration 30`.

### Execution Flow

1. **Shell parses command:**
   ```bash
   focus start --apps Slack --duration 30
   ```
   Shell finds `focus` in `$PATH` → reads shebang → runs `node /usr/local/bin/focus start --apps Slack --duration 30`

2. **Node loads `bin/focus`:**
   - Imports commander
   - Sets up command definitions
   - Calls `program.parse()`

3. **Commander routes to handler:**
   - Parses `process.argv` (the arguments array)
   - Matches `start` command
   - Creates `options` object: `{ apps: "Slack", duration: "30" }`
   - Calls `startCommand(options)`

4. **startCommand executes:**
   ```javascript
   // Validate
   if (duration < 1 || duration > 480) throw new Error('...');
   
   // Acquire lock (throws if already locked)
   acquireLock();  // Creates focus.lock file
   
   // Spawn watcher daemon
   const child = spawn(process.execPath, [WATCHER_PATH], {
     detached: true,    // Don't tie to parent's lifetime
     stdio: 'ignore',   // Don't capture output
     env: {
       FOCUS_SESSION_ID: sessionId,
       FOCUS_TOKEN: token
     }
   });
   child.unref();  // Allow parent to exit
   
   // Wait for handshake (up to 5s)
   while (Date.now() < deadline) {
     if (readyFile exists && token matches) {
       // Success!
       break;
     }
     await sleep(100);
   }
   ```

5. **Parent process exits:**
   - Watcher is now running independently in the background
   - Parent displays success and exits with code 0

### Where Does Watcher Run?

The watcher (spawned with `detached: true`) is now **a completely independent process**:
- It has its own PID
- It keeps running even if the parent dies
- It doesn't share stdin/stdout/stderr (logs go to a file instead)
- Only way to stop it: send a signal (SIGTERM) or let it detect session expiration

---

## The Detached Daemon Pattern

### What is a Daemon?

A **daemon** (or service) is a background process that runs continuously without user interaction. Classic examples:
- Web servers (keep listening for requests)
- System services (keep monitoring something)

### Why Detach?

When you spawn a child process normally:

```javascript
const child = spawn('node', ['watcher.js']);
// Parent is now "attached" to child
// When parent exits, child is terminated (cascade)
```

But `focus start` should:
1. Start the watcher
2. Exit immediately
3. Let watcher keep running in the background

So we use `detached: true`:

```javascript
const child = spawn('node', ['watcher.js'], {
  detached: true,  // Detach from parent's lifecycle
  stdio: 'ignore'  // Don't capture output
});
child.unref();  // Allow parent's event loop to exit
```

Now:
- Parent exits ✓
- Watcher keeps running ✓
- Watcher becomes owned by init (PID 1 on Unix)

### How the Watcher Stays Alive

`src/watcher.js`:

```javascript
const sessionId = process.env.FOCUS_SESSION_ID;
const token = process.env.FOCUS_TOKEN;

// Write handshake token (signals to parent: "I'm ready")
writeFileSync(readyFile, token);

// Start polling loop
setInterval(poll, 3000);  // Every 3 seconds

async function poll() {
  const session = readSession();
  
  if (!session || Date.now() >= endsAt) {
    // Session expired or deleted by parent
    cleanup('session expired');
    return;
  }
  
  for (const app of session.apps) {
    const processes = findProcesses(app);
    for (const proc of processes) {
      terminateProcess(proc.pid);
    }
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => cleanup('SIGTERM received'));
process.on('SIGINT', () => cleanup('SIGINT received'));

async function cleanup(reason) {
  deleteSession();
  releaseLock();
  process.exit(0);
}
```

The watcher:
1. **Polls continuously** (every 3s)
2. **Reads session state from disk** (not passed in—allows parent to update or delete)
3. **Exits cleanly** on signal or expiration

This is why `focus stop` works:
- Sends SIGTERM to watcher PID
- Watcher's signal handler runs `cleanup()`
- Watcher deletes session and exits

---

## File-Based IPC

### The Problem: Parent and Child Communication

After the parent spawns the watcher (`detached: true`), they can't use pipes or normal inter-process channels. How do they stay in sync?

### The Solution: Shared Files

distraction-blocker uses the filesystem as a message bus:

**1. Session file (`~/.local/state/focus/session.json`):**

```json
{
  "version": 1,
  "sessionId": "uuid-here",
  "startedAt": "2026-04-22T10:00:00Z",
  "endsAt": "2026-04-22T10:25:00Z",
  "apps": ["Slack", "Teams"],
  "watcher": {
    "pid": 12345,
    "token": "abc123..."
  }
}
```

**2. Lock file (`~/.local/state/focus/focus.lock`):**

```
12345  # Just the PID of the session-owning process
```

**3. Ready file (`~/.local/state/focus/watcher.ready`):**

```
abc123...  # Handshake token
```

### Handshake Sequence

This is how parent and child verify each other:

```
1. Parent spawns watcher with env vars (FOCUS_SESSION_ID, FOCUS_TOKEN)
2. Parent writes session file (with watcher PID = 0 initially)
3. Parent spawns actual child process, gets real PID
4. Parent updates session file with real watcher PID
5. Watcher starts up, reads env vars and session file
6. Watcher writes token to ready-file
7. Parent polls ready-file every 100ms
8. When token matches, parent knows watcher is alive ✓
9. If 5s passes with no token match, parent kills watcher and fails
```

### Why File-Based IPC?

1. **Survives detachment:** Doesn't need live connection like pipes do
2. **Atomic on Unix:** Creating/renaming files is atomic (safe from race conditions)
3. **Observable:** You can see the state on disk (great for debugging)
4. **Simple:** No socket protocols or binary serialization needed

### Downside

File I/O is slower than in-memory communication. That's why the watcher only polls every 3 seconds—if it polled every 100ms, it would be hammering the disk.

---

## Process Signals and Graceful Shutdown

### What are Signals?

**Signals** are async notifications sent to processes. Examples:
- `SIGTERM` — terminate (gracefully, if handler exists)
- `SIGKILL` — terminate (forcefully, no handler possible)
- `SIGINT` — interrupt (Ctrl+C)
- `SIGUSR1` — user-defined (you decide what it means)

### How Signals Work in Node

```javascript
process.on('SIGTERM', (sig) => {
  console.log('Received SIGTERM');
  cleanup();
  process.exit(0);
});

process.kill(PID, 'SIGTERM');  // Send SIGTERM to another process
```

### Graceful Shutdown Pattern

In `focus stop`:

```javascript
// 1. Verify watcher is alive
const { alive, stale } = verifyWatcher(session);

// 2. Display confirmation countdown
await showCountdown(10);  // 10s to cancel with Ctrl+C

// 3. Send SIGTERM (graceful)
process.kill(watcherPid, 'SIGTERM');

// 4. Clean up our state
deleteSession();
releaseLock();
```

In watcher:

```javascript
let shuttingDown = false;

async function cleanup(reason) {
  if (shuttingDown) return;  // Already running
  shuttingDown = true;
  
  log(`Cleaning up: ${reason}`);
  deleteSession();
  releaseLock();
  unlinkSync(readyFile);
  process.exit(0);
}

process.on('SIGTERM', () => cleanup('SIGTERM received'));
process.on('SIGINT', () => cleanup('SIGINT received'));
```

### SIGTERM vs SIGKILL

- **SIGTERM** — "Please terminate gracefully"
  - Signal handler can run cleanup code
  - If ignored, process keeps running
  - This is what `focus stop` sends

- **SIGKILL** — "Terminate NOW"
  - No signal handler possible
  - Always kills the process immediately
  - Used by `terminateProcess()` if SIGTERM doesn't work within 2s

```javascript
export async function terminateProcess(pid) {
  // Try SIGTERM first (graceful)
  process.kill(pid, 'SIGTERM');
  
  // Wait 2 seconds
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    await sleep(100);
    if (!isAlive(pid)) return;  // Process exited, success
  }
  
  // If still alive, use SIGKILL (forceful)
  try {
    process.kill(pid, 'SIGKILL');
  } catch { /* ignore */ }
}
```

---

## Cross-Platform Considerations

### Process Listing Differences

macOS and Linux use slightly different `ps` flags:

**macOS (`platform/darwin.js`):**
```javascript
const output = execFileSync('ps', ['-axo', 'pid,comm']);
// -a: all user processes
// -x: include processes not attached to terminal
// -o: output format (pid,comm)
```

**Linux (`platform/linux.js`):**
```javascript
const output = execFileSync('ps', ['-eo', 'pid,comm']);
// -e: all processes
// -o: output format (pid,comm)
```

Both return similar output; we parse it the same way.

### Process Name Normalization

Different platforms represent process names differently:

**macOS:**
- Full app path: `/Applications/Slack.app`
- Bundle name: `Slack.app` (from `ps`)

**Linux:**
- Binary path: `/usr/bin/slack`
- Or just: `slack`

Solution: normalize all names to lowercase, strip path, strip extensions:

```javascript
export function normalise(name) {
  return name
    .toLowerCase()
    .replace(/\.app$/i, '')    // Remove .app (macOS)
    .replace(/\.exe$/i, '')    // Remove .exe (Windows, if supported)
    .replace(/.*[/\\]/, '')    // Remove path
    .trim();
}

// Examples:
normalise('/Applications/Slack.app') // → 'slack'
normalise('/usr/bin/slack')           // → 'slack'
normalise('Slack.app')                // → 'slack'
normalise('slack')                    // → 'slack'
```

### XDG Compliance (Linux)

macOS stores data in `~/.focus`. Linux respects **XDG** (freedesktop) standards:

- Config: `$XDG_CONFIG_HOME/focus` (default: `~/.config/focus`)
- State: `$XDG_STATE_HOME/focus` (default: `~/.local/state/focus`)

```javascript
function getPaths() {
  if (process.platform === 'darwin') {
    return { configDir: '~/.focus', stateDir: '~/.focus' };
  } else {
    const xdgConfig = process.env.XDG_CONFIG_HOME || '~/.config';
    const xdgState = process.env.XDG_STATE_HOME || '~/.local/state';
    return {
      configDir: `${xdgConfig}/focus`,
      stateDir: `${xdgState}/focus`
    };
  }
}
```

This lets power users override paths with env vars without changing code.

---

## Debugging Tips

### 1. Check the Log File

Watcher logs go to a file (not stdout). Find it:

```bash
# macOS
cat ~/.focus/focus.log

# Linux
cat ~/.local/state/focus/focus.log
```

### 2. Inspect Lock/Session/Ready Files

```bash
# See what session is active
cat ~/.local/state/focus/session.json

# See what PID is locked
cat ~/.local/state/focus/focus.lock

# Check if watcher handshook
cat ~/.local/state/focus/watcher.ready
```

### 3. Manually Check Process

```bash
# List all processes with "Slack" in the name
ps aux | grep -i slack

# Send SIGTERM to specific PID
kill -TERM 12345

# Force kill (if SIGTERM doesn't work)
kill -9 12345
```

### 4. Trace a Running Watcher

```bash
# Find watcher PID
lsof ~/.local/state/focus/watcher.ready

# Watch its activity
strace -p <PID>  # (Linux; might need sudo)
```

### 5. Verify CLI Routing

Add debug output:

```bash
# Run with debug (via NODE_DEBUG)
NODE_DEBUG=* focus start --duration 2

# Or modify bin/focus temporarily
console.log('Args:', process.argv);
console.log('Options:', options);
```

### 6. Common Exit Codes

- `0` — Success
- `1` — Generic error (session already active, invalid duration, etc.)
- (Unlisted) — Signal-based exit (e.g., SIGTERM = exit code 128 + 15 = 143)

---

## Common Pitfalls

### 1. "Session already active" but No Session File

**Problem:** Lock file exists but session file is missing.

**Diagnosis:** The watcher crashed or was force-killed; file-based cleanup failed.

**Fix:**
```bash
rm ~/.local/state/focus/focus.lock
focus start  # Should work now
```

**Prevention:** Always use graceful shutdown (`focus stop --force`), not `kill -9`.

### 2. Watcher Keeps Terminating Processes

**Problem:** Watcher terminates an app 3 seconds after I relaunch it.

**Expected:** This is normal! Watcher is doing its job.

**If unwanted:** Either:
- `focus stop` to end the session
- Add the app to config exceptions (if implemented)
- Increase session duration

### 3. Handshake Timeout

**Problem:** `focus start` fails with "Watcher handshake timeout".

**Causes:**
- Watcher crashed before writing ready-file
- Filesystem is very slow
- Permission error writing ready-file

**Debug:**
```bash
ls -la ~/.local/state/focus/watcher.ready  # Does it exist?
tail ~/.local/state/focus/focus.log        # What error?
```

### 4. Can't Kill a Blocked App

**Problem:** Watcher tries to kill an app but it won't stay dead.

**Causes:**
- App has been sudo'd (watcher lacks permission)
- App respawns itself
- App ignores SIGTERM (handles it but continues running)

**Behavior:** Watcher keeps trying every 3s (logged as failures, not fatal).

### 5. Running `focus start` Twice

**Problem:** Running `focus start` while one is already active.

**Expected behavior:** First command returns "SessionAlreadyActiveError", exits with code 1.

**Why:** `acquireLock()` uses O_EXCL flag to ensure atomic lock creation. Only one process can succeed.

### 6. "stale lock" Messages in Status

**Problem:** `focus status` shows "Watcher is stale".

**Causes:**
- Watcher crashed
- System rebooted
- Watcher PID was reused by a different process

**Fix:**
```bash
focus stop --force  # Cleans up stale state
```

---

## Next Steps

Now that you understand how Node CLI apps and detached daemons work:

1. **Read the code:** Start with `bin/focus`, trace through `startCommand`, then `watcher.js`
2. **Look at the tests:** `test/integration/lifecycle.test.js` shows all flows in action
3. **Modify it:** Try adding a new command (e.g., `focus config`), or a new feature (e.g., exclude list)
4. **Explore signals:** Try different signals, or add SIGUSR1 handler to toggle something
5. **Add observability:** Enhance logging with structured JSON (for easier parsing)

Good luck, and happy coding!
