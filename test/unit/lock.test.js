import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const tmpDir = mkdtempSync(join(tmpdir(), 'focus-test-lock-'));
process.env.XDG_CONFIG_HOME = tmpDir;
process.env.XDG_STATE_HOME = tmpDir;

const { acquireLock, releaseLock, isLockStale } = await import('../../src/lock.js');

describe('lock', () => {
  afterEach(() => {
    releaseLock();
  });

  test('acquireLock succeeds when no lock exists', () => {
    assert.doesNotThrow(() => acquireLock());
  });

  test('acquireLock throws SessionAlreadyActiveError when lock exists', async () => {
    acquireLock();
    const { SessionAlreadyActiveError } = await import('../../src/errors.js');
    assert.throws(() => acquireLock(), SessionAlreadyActiveError);
  });

  test('releaseLock is idempotent', () => {
    assert.doesNotThrow(() => releaseLock());
    assert.doesNotThrow(() => releaseLock());
  });

  test('isLockStale returns false when no lock file', () => {
    assert.strictEqual(isLockStale(), false);
  });

  test('teardown', () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
