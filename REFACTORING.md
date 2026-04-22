# Distraction-Blocker: Refactoring Recommendations

This document outlines prioritized suggestions to improve developer experience and maintainability without changing runtime behavior. Each suggestion includes severity, effort estimate, impacted files, rationale, and a safe migration strategy.

**Document Status:** These are recommendations for future improvements. No changes have been implemented in the codebase yet.

**How to Use:** Pick 1-2 suggestions at a time (start with "Quick Wins"), implement with tests passing, and iterate. All suggestions maintain backward compatibility.

---

## Summary Table

| # | Title | Severity | Effort | Tier | Payoff |
|---|-------|----------|--------|------|--------|
| 1 | Extract sleep() util | LOW | S | Quick Win | Eliminate duplication |
| 2 | Magic numbers → constants | MEDIUM | M | Tier 1 | Improve discoverability |
| 3 | Add JSDoc comments | MEDIUM | M | Tier 1 | Enable IDE tooltips ✓ |
| 4 | Consolidate cleanup | MEDIUM | M | Tier 2 | Single source of truth |
| 5 | Add validation module | MEDIUM | M | Tier 2 | Testable, reusable |
| 6 | Structured logging | MEDIUM | M | Tier 2 | Easier debugging |
| 7 | Dedupe platform code | LOW | M | Tier 1 | Reduce copy-paste bugs |
| 8 | Session schema validation | MEDIUM | M | Tier 2 | Prevent silent failures |
| 9 | App normalization util | LOW | S | Quick Win | Centralize logic |
| 10 | Handshake utility | LOW | M | Tier 1 | Testable, reusable |

**Total estimated effort:** ~285 minutes for all 10  
**Recommended phasing:** Quick Wins (40 min) → Tier 1 (85 min) → Tier 2 (160 min)

---

## 1. Extract Duplicate `sleep()` Function to Utils Module

**Severity:** LOW | **Effort:** S (15 min) | **Tier:** Quick Win

### Problem

The `sleep()` utility is defined identically in two places:
- `src/commands/start.js` (line 138)
- `src/process.js` (line 39)

Maintenance burden: If we need to retry-with-backoff or add timeout handling, we must edit two places.

### Solution

Create `src/utils.js`:

```javascript
/**
 * Utility function to create a promise-based delay.
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

Update imports in `start.js` and `process.js`:
```javascript
import { sleep } from '../utils.js'
// Remove local sleep() function
```

### Migration Strategy

1. Create `src/utils.js` with `sleep()` export
2. Update `src/commands/start.js`:
   - Add import: `import { sleep } from '../utils.js'`
   - Delete local `sleep()` function
3. Update `src/process.js`:
   - Add import: `import { sleep } from '../utils.js'`
   - Delete local `sleep()` function
4. Run tests: `npm test`
5. Verify: `grep -r "function sleep" src/` should return nothing

### Risk

**NONE.** Pure refactor, no behavior change.

---

## 2. Extract Magic Numbers to Constants Module

**Severity:** MEDIUM | **Effort:** M (30 min) | **Tier:** Tier 1

### Problem

System timing parameters are scattered as magic numbers throughout the code:

- `3000` (watcher poll interval) in `watcher.js`
- `2000` (process kill timeout) in `process.js`
- `5000` (handshake timeout) in `start.js`
- `100` (handshake poll interval) in `start.js`
- `480` (max duration) in `start.js`
- `20` (max apps) in `start.js`
- `10` (confirmation delay) in `config.js`

**Why this matters:** Developers don't know why these values were chosen or how to tune them. If we need to adjust timeouts for slow systems, we must hunt through files.

### Solution

Create `src/constants.js`:

```javascript
/**
 * Configuration constants for distraction-blocker.
 * Tune these values to adjust system behavior (timeouts, limits, intervals).
 */

// Timing parameters (milliseconds)
export const WATCHER_POLL_INTERVAL_MS = 3000;
export const PROCESS_KILL_TIMEOUT_MS = 2000;
export const WATCHER_HANDSHAKE_TIMEOUT_MS = 5000;
export const WATCHER_HANDSHAKE_POLL_MS = 100;

// Limits (numbers)
export const SESSION_MAX_DURATION_MINUTES = 480;
export const SESSION_MAX_APPS = 20;

// User-facing delays (seconds)
export const DEFAULT_CONFIRMATION_DELAY_SECS = 10;
```

### Migration Strategy

1. Create `src/constants.js` with constants above
2. Update `src/watcher.js`:
   ```javascript
   import { WATCHER_POLL_INTERVAL_MS } from './constants.js';
   setInterval(poll, WATCHER_POLL_INTERVAL_MS);
   ```
3. Update `src/process.js`:
   ```javascript
   import { PROCESS_KILL_TIMEOUT_MS } from './constants.js';
   const deadline = Date.now() + PROCESS_KILL_TIMEOUT_MS;
   ```
4. Update `src/commands/start.js`:
   ```javascript
   import { 
     SESSION_MAX_DURATION_MINUTES,
     SESSION_MAX_APPS,
     WATCHER_HANDSHAKE_TIMEOUT_MS,
     WATCHER_HANDSHAKE_POLL_MS
   } from '../constants.js';
   
   if (durationMinutes > SESSION_MAX_DURATION_MINUTES) throw new Error('...');
   const deadline = Date.now() + WATCHER_HANDSHAKE_TIMEOUT_MS;
   ```
5. Update `src/config.js`:
   ```javascript
   import { DEFAULT_CONFIRMATION_DELAY_SECS } from './constants.js';
   const DEFAULTS = { confirmationDelaySecs: DEFAULT_CONFIRMATION_DELAY_SECS };
   ```
6. Run tests: `npm test` (should all pass—no behavior change)

### Risk

**NONE.** Constants are immutable and clearly named. Refactor is purely organizational.

---

## 3. Add JSDoc Comments to Exported Functions

**Status:** ✓ **COMPLETE** | See implementation in codebase

Module and function-level JSDoc have been added to:
- `src/paths.js`, `src/lock.js`, `src/process.js`, `src/config.js`
- `src/watchdog.js`, `src/watcher.js`, `src/commands/start.js`
- `src/platform/darwin.js`, `src/platform/linux.js`
- `bin/focus`

Benefits:
- IDE tooltips when hovering over function names
- Type hints for future TypeScript migration
- Clearer contracts (parameters, return types, exceptions)
- Improved discoverability for new contributors

---

## 4. Consolidate Cleanup Logic Across Three Locations

**Severity:** MEDIUM | **Effort:** M (35 min) | **Tier:** Tier 2

### Problem

Three places delete session, release lock, and remove ready-file in slightly different ways:

- `watchdog.js` `recoverWatcher()` (line 26)
- `watcher.js` `cleanup()` (line 24)
- `commands/stop.js` (line 35)

**Risk:** Copy-paste bugs. If cleanup semantics change (e.g., add log rotation), we must edit three places.

### Solution

Create `src/cleanup.js`:

```javascript
/**
 * Performs full session cleanup: deletes session, releases lock, removes ready-file.
 * Idempotent: safe to call multiple times.
 */
export function performSessionCleanup() {
  deleteSession();
  releaseLock();
  const { readyFile } = getPaths();
  try {
    unlinkSync(readyFile);
  } catch { /* already gone */ }
}
```

### Migration Strategy

1. Create `src/cleanup.js` with function above
2. Update `src/watchdog.js`:
   ```javascript
   import { performSessionCleanup } from './cleanup.js';
   export function recoverWatcher(session) {
     // ...
     performSessionCleanup();
     throw new WatcherStaleError();
   }
   ```
3. Update `src/watcher.js`:
   ```javascript
   import { performSessionCleanup } from './cleanup.js';
   async function cleanup(reason) {
     if (shuttingDown) return;
     shuttingDown = true;
     log(`Watcher stopping: ${reason}`);
     performSessionCleanup();
     process.exit(0);
   }
   ```
4. Update `src/commands/stop.js`:
   ```javascript
   import { performSessionCleanup } from '../cleanup.js';
   // In stopCommand():
   performSessionCleanup();
   ```
5. Run integration tests: `npm test -- test/integration/`

### Risk

**LOW.** Cleanup logic is now centralized but behavior is identical. Tests verify end-to-end.

---

## 5. Extract Input Validation to Separate Module

**Severity:** MEDIUM | **Effort:** M (35 min) | **Tier:** Tier 2

### Problem

`startCommand()` mixes business logic with parameter validation (lines 19-36):

```javascript
if (isNaN(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
  throw new Error('Duration must be between 1 and 480 minutes.');
}
if (!apps || apps.length === 0) {
  throw new Error('No apps specified. Use --apps or set defaultApps in your config file.');
}
if (apps.length > 20) {
  throw new Error('Maximum of 20 apps allowed.');
}
```

**Why this matters:** Validation is not unit-testable in isolation. Hard to reuse validation rules if CLI evolves.

### Solution

Create `src/validate.js`:

```javascript
/**
 * Validates session startup parameters.
 */

export function validateDuration(durationMinutes) {
  if (isNaN(durationMinutes) || durationMinutes < 1 || durationMinutes > 480) {
    throw new Error('Duration must be between 1 and 480 minutes.');
  }
}

export function validateApps(apps) {
  if (!apps || apps.length === 0) {
    throw new Error('No apps specified. Use --apps or set defaultApps in your config file.');
  }
  if (apps.length > 20) {
    throw new Error('Maximum of 20 apps allowed.');
  }
}
```

### Migration Strategy

1. Create `src/validate.js` with validators above
2. Update `src/commands/start.js`:
   ```javascript
   import { validateDuration, validateApps } from '../validate.js';
   
   export async function startCommand(options) {
     const durationMinutes = parseInt(options.duration, 10);
     validateDuration(durationMinutes);
     
     const config = loadConfig();
     let apps = options.apps
       ? options.apps.split(',').map(a => a.trim()).filter(Boolean)
       : config.defaultApps;
     
     validateApps(apps);
     // ... rest of startCommand
   }
   ```
3. Add unit tests in `test/unit/validate.test.js`:
   ```javascript
   import { validateDuration, validateApps } from '../../src/validate.js';
   
   test('validateDuration accepts 1-480', () => {
     validateDuration(1);  // Should not throw
     validateDuration(25);
     validateDuration(480);
   });
   
   test('validateDuration rejects outside range', () => {
     assert.throws(() => validateDuration(0));
     assert.throws(() => validateDuration(481));
     assert.throws(() => validateDuration(NaN));
   });
   
   test('validateApps requires 1-20 apps', () => {
     assert.throws(() => validateApps([]));
     assert.throws(() => validateApps(Array(21).fill('app')));
     validateApps(['Slack']);  // Should not throw
   });
   ```
4. Run all tests: `npm test`

### Risk

**LOW.** Validation logic extracted but behavior unchanged. Unit tests provide safety net.

---

## 6. Structured Logging with Context and Levels

**Severity:** MEDIUM | **Effort:** M (30 min) | **Tier:** Tier 2

### Problem

Current logger (`logger.js`) only appends raw strings:

```javascript
export function log(message) {
  const { logFile } = getPaths();
  appendFileSync(logFile, `${new Date().toISOString()} ${message}\n`);
}
```

**Debugging pain:** When logs get large, you can't easily filter by level or correlate context (which process? which session?).

### Solution

Enhanced `src/logger.js`:

```javascript
/**
 * Structured logger with levels and context.
 */

export function log(message, level = 'info', context = {}) {
  const { logFile } = getPaths();
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    pid: process.pid
  }) + '\n';
  appendFileSync(logFile, entry, { mode: 0o600 });
}

export const debug = (msg, ctx) => log(msg, 'debug', ctx);
export const info = (msg, ctx) => log(msg, 'info', ctx);
export const warn = (msg, ctx) => log(msg, 'warn', ctx);
export const error = (msg, ctx) => log(msg, 'error', ctx);
```

### Migration Strategy

1. Update `src/logger.js` with code above
2. Update call sites in `src/watcher.js`:
   ```javascript
   import { log, warn, error } from './logger.js';
   
   // Old: log(`Terminating process ${name} (${pid})`)
   // New:
   log('Terminating process', 'info', { pid, name });
   ```
3. Maintain backward compatibility:
   ```javascript
   // Old code still works
   log(`Terminating ${name}`)  // Uses default level='info', context={}
   ```
4. Update other call sites (in `watcher.js`) similarly
5. Logs now output JSON, easier to parse/grep:
   ```bash
   # Filter for errors
   grep '"level":"error"' ~/.local/state/focus/focus.log
   
   # Filter by PID
   grep '"pid":12345' ~/.local/state/focus/focus.log
   ```

### Risk

**LOW.** Backward compatible (bare `log(msg)` still works). Existing log files won't parse as JSON, but new ones will. If parsing old logs matters, keep format auto-detection.

---

## 7. Deduplicate Platform-Specific Process Listing

**Severity:** LOW | **Effort:** M (25 min) | **Tier:** Tier 1

### Problem

`src/platform/darwin.js` and `src/platform/linux.js` have identical `parsePs()` and `normalise()` functions. Only difference: `ps` flags.

**Why this matters:** Any bug in parsing logic must be fixed twice. New normalizations (e.g., .snap extensions on Linux) aren't applied consistently.

### Solution

Create `src/platform/common.js`:

```javascript
/**
 * Cross-platform process parsing utilities.
 * Shared logic for darwin.js and linux.js.
 */

export function normalise(name) {
  return name
    .toLowerCase()
    .replace(/\.app$/i, '')
    .replace(/\.exe$/i, '')
    .replace(/.*[/\\]/, '') // strip path
    .trim();
}

export function parsePs(output) {
  const lines = output.trim().split('\n').slice(1); // skip header
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) continue;
    const pid = parseInt(trimmed.slice(0, spaceIdx), 10);
    const comm = trimmed.slice(spaceIdx + 1).trim();
    if (!isNaN(pid) && comm) {
      result.push({ pid, name: normalise(comm) });
    }
  }
  return result;
}
```

### Migration Strategy

1. Create `src/platform/common.js` with code above
2. Update `src/platform/darwin.js`:
   ```javascript
   import { execFileSync } from 'child_process';
   import { parsePs, normalise } from './common.js';
   
   export function listProcesses() {
     const output = execFileSync('ps', ['-axo', 'pid,comm'], { encoding: 'utf8' });
     return parsePs(output);
   }
   
   export { normalise };
   ```
3. Update `src/platform/linux.js`:
   ```javascript
   import { execFileSync } from 'child_process';
   import { parsePs, normalise } from './common.js';
   
   export function listProcesses() {
     const output = execFileSync('ps', ['-eo', 'pid,comm'], { encoding: 'utf8' });
     return parsePs(output);
   }
   
   export { normalise };
   ```
4. Run tests: `npm test -- test/unit/process.test.js` (if it exists)
5. Manual verification:
   ```bash
   node -e "import('./src/process.js').then(m => console.log(m.findProcesses('node')))"
   ```

### Risk

**VERY LOW.** Common logic is extracted but both adapters still export identical API. No behavior change.

---

## 8. Session Data Validation and Schema

**Severity:** MEDIUM | **Effort:** M (30 min) | **Tier:** Tier 2

### Problem

Session files are JSON, but structure isn't validated. If file is corrupted or has wrong schema, code fails silently or crashes.

**Example:** If `session.apps` is a string instead of array, `for (const app of session.apps)` crashes in watcher.

### Solution

Add validation to `src/session.js`:

```javascript
/**
 * Validates session object matches expected schema.
 * @throws {Error} If session is invalid
 */
function validateSessionSchema(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('Invalid session: not an object');
  }
  if (!session.version) {
    throw new Error('Invalid session: missing version');
  }
  if (!session.sessionId || typeof session.sessionId !== 'string') {
    throw new Error('Invalid session: missing or invalid sessionId');
  }
  if (!Array.isArray(session.apps)) {
    throw new Error('Invalid session: apps must be an array');
  }
  if (!session.watcher || typeof session.watcher !== 'object') {
    throw new Error('Invalid session: missing watcher metadata');
  }
  if (typeof session.watcher.pid !== 'number') {
    throw new Error('Invalid session: watcher.pid must be a number');
  }
}

export function readSession() {
  const { sessionFile } = getPaths();
  if (!existsSync(sessionFile)) return null;
  try {
    const parsed = JSON.parse(readFileSync(sessionFile, 'utf8'));
    validateSessionSchema(parsed);
    return parsed;
  } catch (e) {
    // Remain permissive: corrupt files just mean "no session"
    // But log the error for debugging
    log(`Warning: invalid session file: ${e.message}`);
    return null;
  }
}

export function writeSession(session) {
  validateSessionSchema(session);  // Fail early on invalid input
  const { sessionFile } = getPaths();
  const tmp = sessionFile + '.tmp';
  writeFileSync(tmp, JSON.stringify(session, null, 2), { mode: 0o600 });
  renameSync(tmp, sessionFile);  // Atomic
}
```

### Migration Strategy

1. Add `validateSessionSchema()` to `src/session.js`
2. Update `readSession()` to call validation (and gracefully degrade on error)
3. Update `writeSession()` to call validation before writing
4. Add unit tests in `test/unit/session.test.js`:
   ```javascript
   test('readSession returns null if invalid schema', () => {
     // Write corrupt session
     writeFileSync(sessionFile, JSON.stringify({ foo: 'bar' }));
     const result = readSession();
     assert.equal(result, null);
   });
   ```
5. Run all tests: `npm test`

### Risk

**LOW.** Validation is defensive: makes bugs obvious instead of silent. Graceful degradation (return null) preserves existing behavior.

---

## 9. Extract App Name Normalization to Utility

**Severity:** LOW | **Effort:** S (20 min) | **Tier:** Quick Win

### Problem

App name normalization is scattered:
- Platform modules normalize during `ps` parsing
- `findProcesses()` normalizes the search term
- User input normalization doesn't happen consistently

**Better:** Centralize normalization so `focus start --apps Slack` consistently matches whether Slack is running as `Slack.app` (macOS) or `slack` (Linux).

### Solution

In `src/process.js`, export and use a centralized normalizer:

```javascript
export function normaliseAppName(appName) {
  return normalise(appName);  // Re-export platform normalise
}
```

In `src/commands/start.js`:

```javascript
import { findProcesses, normaliseAppName } from '../process.js';

export async function startCommand(options) {
  // ... validation ...
  
  // Normalize user input
  let apps = options.apps
    ? options.apps
        .split(',')
        .map(a => normaliseAppName(a.trim()))
        .filter(Boolean)
    : config.defaultApps.map(normaliseAppName);
  
  // Rest of function...
}
```

### Migration Strategy

1. Add `normaliseAppName()` export to `src/process.js`
2. Update `src/commands/start.js` to normalize input (as shown above)
3. Run integration tests: `npm test -- test/integration/lifecycle.test.js`
4. Manual test:
   ```bash
   focus start --apps Slack --duration 2
   focus status
   focus stop --force
   ```

### Risk

**NONE.** Normalization is idempotent (normalizing twice = same result). Behavior unchanged.

---

## 10. Extract Handshake Logic to Dedicated Module

**Severity:** LOW | **Effort:** M (25 min) | **Tier:** Tier 1

### Problem

Watcher handshake protocol (lines 100-120 in `start.js`) is tightly coupled to startCommand. Hard to test, hard to reuse, hard to enhance.

### Solution

Create `src/handshake.js`:

```javascript
/**
 * Watcher handshake protocol.
 * Spawns watcher daemon and waits for token-based acknowledgment.
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { sleep } from './utils.js';
import { getPaths } from './paths.js';
import {
  WATCHER_HANDSHAKE_TIMEOUT_MS,
  WATCHER_HANDSHAKE_POLL_MS
} from './constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WATCHER_PATH = join(__dirname, 'watcher.js');

/**
 * Spawns watcher daemon and waits for handshake token.
 * @async
 * @param {string} sessionId - Session identifier
 * @param {string} token - Handshake token (watcher should write to ready-file)
 * @returns {Promise<number>} Watcher PID on success
 * @throws {Error} On spawn failure or handshake timeout
 */
export async function performHandshake(sessionId, token) {
  const child = spawn(process.execPath, [WATCHER_PATH], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      FOCUS_SESSION_ID: sessionId,
      FOCUS_TOKEN: token
    }
  });
  child.unref();

  // Wait for ready-file with matching token
  const { readyFile } = getPaths();
  const deadline = Date.now() + WATCHER_HANDSHAKE_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(WATCHER_HANDSHAKE_POLL_MS);
    if (existsSync(readyFile)) {
      const fileToken = readFileSync(readyFile, 'utf8').trim();
      if (fileToken === token) {
        return child.pid;
      }
    }
  }

  // Timeout
  try {
    process.kill(child.pid, 'SIGTERM');
  } catch { /* ignore */ }
  throw new Error('Watcher handshake timeout');
}
```

### Migration Strategy

1. Create `src/handshake.js` with code above
2. Update `src/commands/start.js`:
   ```javascript
   import { performHandshake } from '../handshake.js';
   
   // In startCommand(), replace lines 100-120 with:
   const watcherPid = await performHandshake(sessionId, token);
   
   // Update session with real watcher PID
   writeSession({
     version: 1,
     sessionId,
     startedAt,
     endsAt,
     apps,
     watcher: { pid: watcherPid, token, startedAt }
   });
   ```
3. Run integration tests: `npm test`

### Risk

**LOW.** Handshake logic is extracted but behavior identical. Tests ensure end-to-end flow works.

---

## How to Implement These Suggestions

### Phase 1: Quick Wins (40 min)

Start here for immediate wins with low effort:

1. **Extract sleep() util** (15 min)
2. **App normalization util** (20 min)

Commit: "refactor: extract shared utilities"

### Phase 2: Tier 1 (85 min)

Improvements that improve code quality and observability:

1. **Magic numbers → constants** (30 min)
2. **Dedupe platform code** (25 min)
3. **Handshake utility** (25 min)

Commit: "refactor: consolidate constants and cross-platform logic"

### Phase 3: Tier 2 (160 min)

Larger changes that significantly improve maintainability:

1. **Cleanup consolidation** (35 min)
2. **Validation module** (35 min)
3. **Structured logging** (30 min)
4. **Session schema validation** (30 min)
5. **Add unit tests** (30 min)

Commits:
- "refactor: consolidate session cleanup logic"
- "refactor: extract validation to dedicated module"
- "refactor: add structured logging with context"
- "test: add validation and schema tests"

### Testing After Each Change

```bash
# Run all tests
npm test

# Run specific test file
npm test -- test/unit/validate.test.js

# Integration test (manual)
npm start  # or: npm run focus start --apps Slack --duration 2
npm run focus status
npm run focus stop --force
```

---

## Notes for Future Maintainers

- **Backward compatibility:** All suggestions maintain the current CLI interface and behavior.
- **Test coverage:** Each refactoring should have corresponding unit tests.
- **Documentation:** Update JSDoc comments alongside code changes.
- **Incremental adoption:** Implement suggestions one at a time. Don't try to refactor everything at once.
- **Community feedback:** If you implement any of these, consider sharing what worked and what didn't.

---

## Questions?

- For questions about implementation, refer to the [Explainer Guide](./explainer.md) for Node CLI fundamentals.
- For architecture overview, open [walkthrough-architecture-process-flow.html](./walkthrough-architecture-process-flow.html) in a browser.
- For quick API reference, check the JSDoc comments in each module.
