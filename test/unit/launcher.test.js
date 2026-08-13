import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { launchApp } = await import('../../src/launcher.js');

describe('launchApp', () => {
  test('rejects an empty app name', () => {
    assert.deepStrictEqual(launchApp(''), { ok: false, error: 'Empty app name' });
  });

  test('rejects a missing app name', () => {
    assert.strictEqual(launchApp(undefined).ok, false);
  });

  test('reports failure for an app that does not exist', () => {
    const result = launchApp('nonexistentapp123');
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /nonexistentapp123/);
  });
});
