import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'focus-test-session-'));
process.env.XDG_CONFIG_HOME = tmpDir;
process.env.XDG_STATE_HOME = tmpDir;

const { readSession, writeSession, deleteSession } = await import('../../src/session.js');

const sampleSession = {
  version: 1,
  sessionId: 'test-id',
  startedAt: new Date().toISOString(),
  endsAt: new Date(Date.now() + 60000).toISOString(),
  apps: ['Slack'],
  watcher: { pid: 99999, token: 'abc123', startedAt: new Date().toISOString() },
};

describe('session', () => {
  test('readSession returns null when no session file', () => {
    assert.strictEqual(readSession(), null);
  });

  test('writeSession + readSession round-trips correctly', () => {
    writeSession(sampleSession);
    const read = readSession();
    assert.deepStrictEqual(read, sampleSession);
  });

  test('deleteSession removes session file', () => {
    deleteSession();
    assert.strictEqual(readSession(), null);
  });

  test('deleteSession is idempotent', () => {
    assert.doesNotThrow(() => deleteSession());
  });

  test('teardown', () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
