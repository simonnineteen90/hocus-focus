import { unlinkSync } from 'fs';
import { readSession, deleteSession } from '../session.js';
import { releaseLock } from '../lock.js';
import { verifyWatcher } from '../watchdog.js';
import { getPaths } from '../paths.js';
import { showSuccess, showWarn, showCountdown } from '../display.js';
import { NoActiveSessionError } from '../errors.js';
import { loadConfig } from '../config.js';

export async function stopCommand(options) {
  const session = readSession();
  if (!session) throw new NoActiveSessionError();

  const { alive, stale } = verifyWatcher(session);

  if (stale && !alive) {
    showWarn('Watcher process not found — cleaning up stale session.');
  }

  if (!options.force) {
    const config = loadConfig();
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

  // Clean up
  deleteSession();
  releaseLock();
  const { readyFile } = getPaths();
  try { unlinkSync(readyFile); } catch { /* ignore */ }

  showSuccess('Focus session stopped. Apps unblocked.');
}
