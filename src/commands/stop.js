import { unlinkSync } from 'fs';
import { readSession, writeSession, deleteSession } from '../session.js';
import { releaseLock } from '../lock.js';
import { verifyWatcher } from '../watchdog.js';
import { getPaths } from '../paths.js';
import { showSuccess, showWarn, showCountdown } from '../display.js';
import { NoActiveSessionError } from '../errors.js';
import { loadConfig } from '../config.js';
import { getSlackToken, restoreSlackStatus } from '../slack.js';

export async function stopCommand(options) {
  const session = readSession();
  if (!session) throw new NoActiveSessionError();

  const config = loadConfig();

  const { alive, stale } = verifyWatcher(session);

  if (stale && !alive) {
    showWarn('Watcher process not found — cleaning up stale session.');
  }

  if (!options.force) {
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

  // Slack status restore (non-fatal)
  try {
    if (session.slackStatus?.set && config.slack?.restoreStatusOnStop !== false) {
      const slackToken = getSlackToken(config);
      if (slackToken) {
        await restoreSlackStatus(slackToken, session.slackStatus);
      }
    }
  } catch (e) {
    showWarn(`Slack status restore failed: ${e.message}`);
  } finally {
    if (session.slackStatus?.set) {
      try { writeSession({ ...session, slackStatus: null }); } catch { /* ignore */ }
    }
  }

  // Clean up
  deleteSession();
  releaseLock();
  const { readyFile } = getPaths();
  try { unlinkSync(readyFile); } catch { /* ignore */ }

  showSuccess('Focus session stopped. Apps unblocked.');
}
