import { readSession } from '../session.js';
import { verifyWatcher } from '../watchdog.js';
import { showStatus, showNoSession, showWarn } from '../display.js';

export function statusCommand() {
  const session = readSession();

  if (!session) {
    showNoSession();
    return;
  }

  const { alive, stale } = verifyWatcher(session);

  if (stale && !alive) {
    showWarn('Session is stale — watcher is not running. Run `focus stop --force` to clean up.');
  }

  if (Date.now() >= new Date(session.endsAt).getTime()) {
    showWarn('Session has expired but was not cleaned up. Run `focus stop --force` to clean up.');
    return;
  }

  showStatus(session);
}
