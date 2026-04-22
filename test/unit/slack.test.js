import { describe, test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

const {
  _overrideHttpRequest,
  _restoreHttpRequest,
  formatDuration,
  interpolateStatusText,
  getSlackToken,
  getStatus,
  setStatus,
  restoreSlackStatus,
} = await import('../../src/slack.js');

// ---------------------------------------------------------------------------
// Mock request factory
// ---------------------------------------------------------------------------

/**
 * Creates a mock for https.request that simulates various API scenarios.
 * @param {{ statusCode?: number, responseBody?: string, networkError?: Error|string|null, timeout?: boolean }} [opts]
 */
function createMockRequest({
  statusCode = 200,
  responseBody = JSON.stringify({ ok: true }),
  networkError = null,
  timeout = false,
} = {}) {
  const calls = [];

  const fn = (options, callback) => {
    const call = { options, body: '' };
    calls.push(call);

    const req = new EventEmitter();
    let timeoutFn = null;

    req.setTimeout = (_ms, fn) => { timeoutFn = fn; };
    req.write = (data) => { call.body += data; };
    req.end = () => {
      setImmediate(() => {
        if (timeout) { if (timeoutFn) timeoutFn(); return; }
        if (networkError) {
          req.emit('error', networkError instanceof Error ? networkError : new Error(networkError));
          return;
        }
        const res = new EventEmitter();
        res.statusCode = statusCode;
        callback(res);
        setImmediate(() => {
          res.emit('data', responseBody);
          res.emit('end');
        });
      });
    };
    req.destroy = (err) => { if (err) req.emit('error', err); };
    return req;
  };

  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
  test('0 minutes -> "0m"', () => assert.strictEqual(formatDuration(0), '0m'));
  test('1 minute -> "1m"', () => assert.strictEqual(formatDuration(1), '1m'));
  test('45 minutes -> "45m"', () => assert.strictEqual(formatDuration(45), '45m'));
  test('60 minutes -> "1h"', () => assert.strictEqual(formatDuration(60), '1h'));
  test('90 minutes -> "1h 30m"', () => assert.strictEqual(formatDuration(90), '1h 30m'));
  test('120 minutes -> "2h"', () => assert.strictEqual(formatDuration(120), '2h'));
  test('480 minutes -> "8h"', () => assert.strictEqual(formatDuration(480), '8h'));
});

// ---------------------------------------------------------------------------
// interpolateStatusText
// ---------------------------------------------------------------------------

describe('interpolateStatusText', () => {
  test('substitutes {{duration}} with formatted duration', () => {
    assert.strictEqual(interpolateStatusText('focusing {{duration}}', 45), 'focusing 45m');
  });

  test('falls back to default template when input is empty string', () => {
    const result = interpolateStatusText('', 45);
    assert.ok(result.includes('45m'), `expected "45m" in "${result}"`);
  });

  test('falls back to default template when input is null', () => {
    const result = interpolateStatusText(null, 60);
    assert.ok(result.includes('1h'), `expected "1h" in "${result}"`);
  });

  test('falls back to default template when input is undefined', () => {
    const result = interpolateStatusText(undefined, 90);
    assert.ok(result.includes('1h 30m'), `expected "1h 30m" in "${result}"`);
  });

  test('caps output at 100 characters', () => {
    const longTemplate = 'a'.repeat(200) + ' {{duration}}';
    const result = interpolateStatusText(longTemplate, 5);
    assert.strictEqual(result.length, 100);
  });

  test('passes through text with no {{duration}} placeholder unchanged', () => {
    assert.strictEqual(interpolateStatusText('no placeholder here', 30), 'no placeholder here');
  });
});

// ---------------------------------------------------------------------------
// getSlackToken
// ---------------------------------------------------------------------------

describe('getSlackToken', () => {
  afterEach(() => { delete process.env.SLACK_TOKEN; });

  test('returns SLACK_TOKEN env var when set', () => {
    process.env.SLACK_TOKEN = 'xoxp-env-token';
    assert.strictEqual(getSlackToken({}), 'xoxp-env-token');
  });

  test('env var takes priority over config value', () => {
    process.env.SLACK_TOKEN = 'xoxp-env-token';
    assert.strictEqual(getSlackToken({ slack: { token: 'xoxp-config-token' } }), 'xoxp-env-token');
  });

  test('returns config.slack.token when env var absent', () => {
    assert.strictEqual(getSlackToken({ slack: { token: 'xoxp-config-token' } }), 'xoxp-config-token');
  });

  test('returns null when neither env var nor config token present', () => {
    assert.strictEqual(getSlackToken({}), null);
  });

  test('returns null when called with no arguments', () => {
    assert.strictEqual(getSlackToken(), null);
  });
});

// ---------------------------------------------------------------------------
// setStatus (mocked https)
// ---------------------------------------------------------------------------

describe('setStatus', () => {
  const TOKEN = 'xoxp-test-token';

  afterEach(() => _restoreHttpRequest());

  test('calls POST /api/users.profile.set', async () => {
    const mock = createMockRequest();
    _overrideHttpRequest(mock);
    await setStatus(TOKEN, { statusText: 'Focusing', statusEmoji: ':technologist:', statusExpiration: 0 });
    assert.strictEqual(mock.calls.length, 1);
    assert.strictEqual(mock.calls[0].options.method, 'POST');
    assert.strictEqual(mock.calls[0].options.path, '/api/users.profile.set');
  });

  test('sets Authorization: Bearer header', async () => {
    const mock = createMockRequest();
    _overrideHttpRequest(mock);
    await setStatus(TOKEN, { statusText: 'x', statusEmoji: ':x:', statusExpiration: 0 });
    assert.strictEqual(mock.calls[0].options.headers.Authorization, `Bearer ${TOKEN}`);
  });

  test('sends correct JSON body', async () => {
    const mock = createMockRequest();
    _overrideHttpRequest(mock);
    await setStatus(TOKEN, { statusText: 'In a meeting', statusEmoji: ':calendar:', statusExpiration: 9999999 });
    const body = JSON.parse(mock.calls[0].body);
    assert.deepStrictEqual(body, {
      profile: { status_text: 'In a meeting', status_emoji: ':calendar:', status_expiration: 9999999 },
    });
  });

  test('rejects with error code when ok: false', async () => {
    const mock = createMockRequest({ responseBody: JSON.stringify({ ok: false, error: 'invalid_auth' }) });
    _overrideHttpRequest(mock);
    await assert.rejects(
      () => setStatus(TOKEN, { statusText: '', statusEmoji: '', statusExpiration: 0 }),
      /invalid_auth/,
    );
  });

  test('rejects with HTTP status on non-2xx response', async () => {
    const mock = createMockRequest({ statusCode: 429, responseBody: 'Too Many Requests' });
    _overrideHttpRequest(mock);
    await assert.rejects(
      () => setStatus(TOKEN, { statusText: '', statusEmoji: '', statusExpiration: 0 }),
      /HTTP 429/,
    );
  });

  test('rejects with descriptive error on timeout', async () => {
    const mock = createMockRequest({ timeout: true });
    _overrideHttpRequest(mock);
    await assert.rejects(
      () => setStatus(TOKEN, { statusText: '', statusEmoji: '', statusExpiration: 0 }),
      /timed out/,
    );
  });

  test('rejects on invalid JSON response', async () => {
    const mock = createMockRequest({ responseBody: 'not-json{{' });
    _overrideHttpRequest(mock);
    await assert.rejects(
      () => setStatus(TOKEN, { statusText: '', statusEmoji: '', statusExpiration: 0 }),
      /invalid JSON/,
    );
  });
});

// ---------------------------------------------------------------------------
// getStatus (mocked https)
// ---------------------------------------------------------------------------

describe('getStatus', () => {
  const TOKEN = 'xoxp-test-token';

  afterEach(() => _restoreHttpRequest());

  test('calls GET /api/users.profile.get', async () => {
    const mock = createMockRequest({
      responseBody: JSON.stringify({ ok: true, profile: { status_text: '', status_emoji: '', status_expiration: 0 } }),
    });
    _overrideHttpRequest(mock);
    await getStatus(TOKEN);
    assert.strictEqual(mock.calls[0].options.method, 'GET');
    assert.strictEqual(mock.calls[0].options.path, '/api/users.profile.get');
  });

  test('sets Authorization: Bearer header', async () => {
    const mock = createMockRequest({
      responseBody: JSON.stringify({ ok: true, profile: { status_text: '', status_emoji: '', status_expiration: 0 } }),
    });
    _overrideHttpRequest(mock);
    await getStatus(TOKEN);
    assert.strictEqual(mock.calls[0].options.headers.Authorization, `Bearer ${TOKEN}`);
  });

  test('returns mapped status fields', async () => {
    const mock = createMockRequest({
      responseBody: JSON.stringify({
        ok: true,
        profile: { status_text: 'Working from home', status_emoji: ':house:', status_expiration: 1234567890 },
      }),
    });
    _overrideHttpRequest(mock);
    const result = await getStatus(TOKEN);
    assert.deepStrictEqual(result, {
      statusText: 'Working from home',
      statusEmoji: ':house:',
      statusExpiration: 1234567890,
    });
  });

  test('defaults missing profile fields to empty/zero', async () => {
    const mock = createMockRequest({ responseBody: JSON.stringify({ ok: true, profile: {} }) });
    _overrideHttpRequest(mock);
    const result = await getStatus(TOKEN);
    assert.deepStrictEqual(result, { statusText: '', statusEmoji: '', statusExpiration: 0 });
  });

  test('rejects when ok: false', async () => {
    const mock = createMockRequest({ responseBody: JSON.stringify({ ok: false, error: 'not_authed' }) });
    _overrideHttpRequest(mock);
    await assert.rejects(() => getStatus(TOKEN), /not_authed/);
  });
});

// ---------------------------------------------------------------------------
// restoreSlackStatus (mocked https)
// ---------------------------------------------------------------------------

describe('restoreSlackStatus', () => {
  const TOKEN = 'xoxp-test-token';

  afterEach(() => _restoreHttpRequest());

  test('calls clearStatus when both previousText and previousEmoji are empty', async () => {
    const mock = createMockRequest();
    _overrideHttpRequest(mock);
    await restoreSlackStatus(TOKEN, { previousText: '', previousEmoji: '', previousExpiration: 9999999999 });
    assert.strictEqual(mock.calls.length, 1);
    const body = JSON.parse(mock.calls[0].body);
    assert.strictEqual(body.profile.status_text, '');
    assert.strictEqual(body.profile.status_emoji, '');
    assert.strictEqual(body.profile.status_expiration, 0);
  });

  test('calls clearStatus when previousExpiration is already in the past', async () => {
    const mock = createMockRequest();
    _overrideHttpRequest(mock);
    const pastExpiration = Math.floor(Date.now() / 1000) - 3600;
    await restoreSlackStatus(TOKEN, { previousText: 'Old status', previousEmoji: ':wave:', previousExpiration: pastExpiration });
    const body = JSON.parse(mock.calls[0].body);
    assert.strictEqual(body.profile.status_text, '');
    assert.strictEqual(body.profile.status_emoji, '');
    assert.strictEqual(body.profile.status_expiration, 0);
  });

  test('calls setStatus with saved values when expiration is in the future', async () => {
    const mock = createMockRequest();
    _overrideHttpRequest(mock);
    const futureExpiration = Math.floor(Date.now() / 1000) + 3600;
    await restoreSlackStatus(TOKEN, { previousText: 'In a meeting', previousEmoji: ':calendar:', previousExpiration: futureExpiration });
    const body = JSON.parse(mock.calls[0].body);
    assert.strictEqual(body.profile.status_text, 'In a meeting');
    assert.strictEqual(body.profile.status_emoji, ':calendar:');
    assert.strictEqual(body.profile.status_expiration, futureExpiration);
  });

  test('calls setStatus with saved values when previousExpiration is 0 (no expiry)', async () => {
    const mock = createMockRequest();
    _overrideHttpRequest(mock);
    await restoreSlackStatus(TOKEN, { previousText: 'Always on', previousEmoji: ':zap:', previousExpiration: 0 });
    const body = JSON.parse(mock.calls[0].body);
    assert.strictEqual(body.profile.status_text, 'Always on');
    assert.strictEqual(body.profile.status_emoji, ':zap:');
    assert.strictEqual(body.profile.status_expiration, 0);
  });
});
