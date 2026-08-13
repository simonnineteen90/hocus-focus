import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const { matchesApp, aliasesFor, bundleNames } = await import('../../src/appMatch.js');

const proc = (name, command) => ({ name, command: command ?? name });

describe('appMatch bundleNames', () => {
  test('extracts the bundle name from a macOS path', () => {
    assert.deepStrictEqual(
      bundleNames('/applications/microsoft teams.app/contents/macos/msteams'),
      ['microsoft teams']
    );
  });

  test('extracts nested bundle names', () => {
    const names = bundleNames('/Applications/Slack.app/Contents/Frameworks/Slack Helper.app/Contents/MacOS/Slack Helper');
    assert.deepStrictEqual(names, ['slack', 'slack helper']);
  });

  test('returns empty array for a path with no bundle', () => {
    assert.deepStrictEqual(bundleNames('/usr/bin/node'), []);
  });

  test('returns empty array for empty input', () => {
    assert.deepStrictEqual(bundleNames(undefined), []);
  });
});

describe('appMatch aliasesFor', () => {
  test('includes the target itself', () => {
    assert.ok(aliasesFor('Slack').has('slack'));
  });

  test('includes built-in aliases for Teams', () => {
    const names = aliasesFor('Teams');
    assert.ok(names.has('msteams'));
    assert.ok(names.has('microsoft teams'));
  });

  test('merges user-supplied aliases', () => {
    const names = aliasesFor('Teams', { Teams: ['teamsy'] });
    assert.ok(names.has('teamsy'));
    assert.ok(names.has('msteams'), 'built-ins are retained');
  });

  test('ignores user aliases for a different app', () => {
    assert.ok(!aliasesFor('Slack', { Teams: ['teamsy'] }).has('teamsy'));
  });
});

describe('appMatch matchesApp', () => {
  test('matches Teams by its differently-named binary', () => {
    const p = proc('msteams', '/Applications/Microsoft Teams.app/Contents/MacOS/MSTeams');
    assert.ok(matchesApp(p, 'Teams'));
  });

  test('matches Teams helper processes via the bundle path', () => {
    const p = proc(
      'microsoft teams webview helper',
      '/Applications/Microsoft Teams.app/Contents/Helpers/Microsoft Teams WebView.app/Contents/MacOS/Microsoft Teams WebView Helper'
    );
    assert.ok(matchesApp(p, 'Teams'));
  });

  test('matches Teams reverse-DNS agent processes', () => {
    assert.ok(matchesApp(proc('com.microsoft.teams2.respawn'), 'Teams'));
  });

  test('matches Outlook by its full binary name', () => {
    const p = proc('microsoft outlook', '/Applications/Microsoft Outlook.app/Contents/MacOS/Microsoft Outlook');
    assert.ok(matchesApp(p, 'Outlook'));
  });

  test('matches Slack helper processes via the bundle path', () => {
    const p = proc('chrome_crashpad_handler', '/Applications/Slack.app/Contents/Frameworks/chrome_crashpad_handler');
    assert.ok(matchesApp(p, 'Slack'));
  });

  test('does not match an unrelated process', () => {
    assert.ok(!matchesApp(proc('node', '/usr/local/bin/node'), 'Teams'));
  });

  test('does not match a different app in the same vendor family', () => {
    const p = proc('microsoft outlook', '/Applications/Microsoft Outlook.app/Contents/MacOS/Microsoft Outlook');
    assert.ok(!matchesApp(p, 'Teams'), 'Outlook must survive a Teams block');
  });

  test('rejects targets that are too short to match safely', () => {
    assert.ok(!matchesApp(proc('ab'), 'ab'));
  });

  test('rejects an empty app name', () => {
    assert.ok(!matchesApp(proc('slack'), ''));
  });

  test('tolerates a .app suffix on the target', () => {
    assert.ok(matchesApp(proc('slack', '/Applications/Slack.app/Contents/MacOS/Slack'), 'Slack.app'));
  });

  test('handles a process with no command path', () => {
    assert.ok(matchesApp({ name: 'slack' }, 'Slack'));
  });
});
