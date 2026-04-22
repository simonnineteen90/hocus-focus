import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Set env before loading modules so paths use temp dir
const tmpDir = mkdtempSync(join(tmpdir(), 'focus-test-config-'));
process.env.XDG_CONFIG_HOME = tmpDir;
process.env.XDG_STATE_HOME = tmpDir;

const { loadConfig } = await import('../../src/config.js');
const { getPaths } = await import('../../src/paths.js');

describe('config', () => {
  test('returns defaults when no config file exists', () => {
    const config = loadConfig();
    assert.ok(Array.isArray(config.defaultApps));
    assert.ok(config.defaultApps.length > 0);
    assert.ok(typeof config.confirmationDelaySecs === 'number');
  });

  test('creates config file on first load', () => {
    const { configFile } = getPaths();
    assert.ok(existsSync(configFile), 'config file should be created');
  });

  test('second load returns same values', () => {
    const a = loadConfig();
    const b = loadConfig();
    assert.deepStrictEqual(a, b);
  });

  test('teardown', () => {
    rmSync(tmpDir, { recursive: true, force: true });
  });
});
