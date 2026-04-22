import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// Import normalise from darwin (same logic on both platforms)
const { normalise } = await import('../../src/platform/darwin.js');

describe('process normalise', () => {
  test('lowercases the name', () => {
    assert.strictEqual(normalise('Slack'), 'slack');
  });

  test('strips .app extension', () => {
    assert.strictEqual(normalise('Slack.app'), 'slack');
  });

  test('strips .exe extension', () => {
    assert.strictEqual(normalise('Teams.exe'), 'teams');
  });

  test('strips path prefix', () => {
    assert.strictEqual(normalise('/Applications/Slack.app/Contents/MacOS/Slack'), 'slack');
  });

  test('handles already-normalised input', () => {
    assert.strictEqual(normalise('slack'), 'slack');
  });

  test('handles mixed case with path', () => {
    assert.strictEqual(normalise('/usr/bin/Discord'), 'discord');
  });
});
