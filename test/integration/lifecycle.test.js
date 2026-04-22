import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binPath = join(__dirname, '..', '..', 'bin', 'focus');

const SUPPORTED = platform() === 'darwin' || platform() === 'linux';

function runFocus(args, env = {}) {
  return execFileSync(process.execPath, [binPath, ...args], {
    encoding: 'utf8',
    timeout: 15000,
    env: { ...process.env, ...env },
  });
}

describe('focus CLI lifecycle', { skip: !SUPPORTED }, () => {
  let tmpDir, testEnv;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'focus-lifecycle-'));
    testEnv = {
      XDG_CONFIG_HOME: tmpDir,
      XDG_STATE_HOME: tmpDir,
      HOME: tmpDir, // isolate macOS ~/.focus too
    };
  });

  after(() => {
    try { runFocus(['stop', '--force'], testEnv); } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test('start creates session.json', () => {
    runFocus(['start', '--apps', 'nonexistentapp123', '--duration', '1'], testEnv);
    const sessionFile = join(tmpDir, 'focus', 'session.json');
    // On macOS path is tmpDir/focus/session.json (HOME/.focus/session.json)
    // Try both paths
    const linuxSession = join(tmpDir, 'focus', 'session.json');
    const macosSession = join(tmpDir, '.focus', 'session.json');
    const found = existsSync(linuxSession) || existsSync(macosSession);
    assert.ok(found, 'session.json must exist after start');
  });

  test('status shows active session', () => {
    const out = runFocus(['status'], testEnv);
    const plain = out.replace(/\x1B\[[0-9;]*m/g, '');
    assert.ok(plain.includes('active') || plain.includes('Remaining') || plain.includes('blocked'),
      `Expected active session output, got: ${plain}`);
  });

  test('start rejects duplicate session', () => {
    assert.throws(
      () => runFocus(['start', '--apps', 'nonexistentapp123', '--duration', '1'], testEnv),
      (e) => { assert.ok(e.status !== 0); return true; }
    );
  });

  test('stop --force cleans up session', async () => {
    runFocus(['stop', '--force'], testEnv);
    // Small wait for watcher to clean up
    await new Promise(r => setTimeout(r, 1500));
    const linuxSession = join(tmpDir, 'focus', 'session.json');
    const macosSession = join(tmpDir, '.focus', 'session.json');
    assert.ok(!existsSync(linuxSession) && !existsSync(macosSession),
      'session.json must be removed after stop');
  });

  test('status shows no-session after stop', () => {
    const out = runFocus(['status'], testEnv);
    const plain = out.replace(/\x1B\[[0-9;]*m/g, '');
    assert.ok(plain.includes('No active'), `Expected no-session message, got: ${plain}`);
  });

  test('start validates duration 0 is invalid', () => {
    assert.throws(
      () => runFocus(['start', '--apps', 'slack', '--duration', '0'], testEnv),
      (e) => { assert.ok(e.status !== 0); return true; }
    );
  });

  test('start validates duration 481 is invalid', () => {
    assert.throws(
      () => runFocus(['start', '--apps', 'slack', '--duration', '481'], testEnv),
      (e) => { assert.ok(e.status !== 0); return true; }
    );
  });

  test('stop with no session exits non-zero', () => {
    assert.throws(
      () => runFocus(['stop', '--force'], testEnv),
      (e) => { assert.ok(e.status !== 0); return true; }
    );
  });
});
