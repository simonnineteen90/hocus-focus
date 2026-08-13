import { unlinkSync } from 'fs';
import { readSession, deleteSession } from '../session.js';
import { releaseLock } from '../lock.js';
import { verifyWatcher } from '../watchdog.js';
import { getPaths } from '../paths.js';
import { showSuccess, showWarn, showCountdown } from '../display.js';
import { terminateApps } from '../apps.js';
import { NoActiveSessionError } from '../errors.js';
import { loadConfig } from '../config.js';

export async function stopCommand(options) {
  const session = readSession();
  if (!session) throw new NoActiveSessionError();

  const { alive, stale } = verifyWatcher(session);

  if (stale && !alive) {
    showWarn('Watcher process not found — cleaning up stale session.');
  }

  const comms = (session.mode ?? 'block') === 'comms';
  const config = loadConfig();

  // The countdown exists to make abandoning a focus session a deliberate act. Ending comms mode is
  // the user choosing to get back to work, so it never needs talking them out of it.
  if (!options.force && !comms) {
    const delaySecs = config.confirmationDelaySecs ?? 10;
    try {
      await showCountdown(delaySecs, 'Stopping focus session in');
    } catch {
      console.log('\nStop cancelled.');
      return;
    }
  }

  // Send SIGTERM to watcher
  if (session.watcher?.pid) {
    try {
      process.kill(session.watcher.pid, 'SIGTERM');
    } catch (e) {
      if (e.code !== 'ESRCH') {
        showWarn(`Could not signal watcher (pid ${session.watcher.pid}): ${e.message}`);
      }
    }
  }

  // The watcher closes comms apps as it shuts down, but it may already be gone (stale session), so
  // close them here too. Terminating an app that has already exited is a no-op.
  if (comms) {
    await terminateApps(session.apps ?? [], { aliases: config.appAliases });
  }

  // Clean up
  deleteSession();
  releaseLock();
  const { readyFile } = getPaths();
  try { unlinkSync(readyFile); } catch { /* ignore */ }

  showSuccess(comms ? 'Comms mode ended. Apps closed.' : 'Focus session stopped. Apps unblocked.');
}
