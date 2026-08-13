import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { parseDuration, resolveApps } = await import('../../src/commands/options.js');

describe('parseDuration', () => {
  test('parses a valid duration', () => {
    assert.strictEqual(parseDuration('45'), 45);
  });

  test('returns null when omitted and not required', () => {
    assert.strictEqual(parseDuration(undefined), null);
  });

  test('throws when omitted and required', () => {
    assert.throws(() => parseDuration(undefined, { required: true }), /required/);
  });

  test('rejects zero', () => {
    assert.throws(() => parseDuration('0'), /between/);
  });

  test('rejects durations above the maximum', () => {
    assert.throws(() => parseDuration('481'), /between/);
  });

  test('rejects non-numeric input', () => {
    assert.throws(() => parseDuration('abc'), /between/);
  });

  test('rejects fractional durations', () => {
    assert.throws(() => parseDuration('10.5'), /between/);
  });
});

describe('resolveApps', () => {
  test('splits and trims the apps option', () => {
    assert.deepStrictEqual(resolveApps(' Slack , Teams ', [], 'defaultApps'), ['Slack', 'Teams']);
  });

  test('falls back to the configured list', () => {
    assert.deepStrictEqual(resolveApps(undefined, ['Slack'], 'defaultApps'), ['Slack']);
  });

  test('throws when nothing is resolved', () => {
    assert.throws(() => resolveApps(undefined, [], 'commsApps'), /commsApps/);
  });

  test('throws when too many apps are supplied', () => {
    const many = Array.from({ length: 21 }, (_, i) => `App${i}`).join(',');
    assert.throws(() => resolveApps(many, [], 'defaultApps'), /Maximum/);
  });
});
