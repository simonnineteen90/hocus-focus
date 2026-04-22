export class SessionAlreadyActiveError extends Error {
  constructor() {
    super('A focus session is already active. Run `focus status` to check it or `focus stop` to end it.');
    this.name = 'SessionAlreadyActiveError';
  }
}

export class NoActiveSessionError extends Error {
  constructor() {
    super('No active focus session. Run `focus start` to begin one.');
    this.name = 'NoActiveSessionError';
  }
}

export class PermissionError extends Error {
  constructor(msg) {
    super(msg || 'Permission denied. Try running with elevated privileges.');
    this.name = 'PermissionError';
  }
}

export class WatcherStaleError extends Error {
  constructor() {
    super('The focus watcher is not running. Run `focus stop --force` to clean up, then `focus start` again.');
    this.name = 'WatcherStaleError';
  }
}
