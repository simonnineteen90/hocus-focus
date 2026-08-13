import chalk from 'chalk';

/**
 * Prints a formatted summary of a session, adapting the wording to its mode.
 * Sessions with no end time (open-ended comms mode) are shown as running until stopped.
 *
 * @param {Object} session - Session object with mode, apps and endsAt
 * @returns {void}
 */
export function showStatus(session) {
  const comms = (session.mode ?? 'block') === 'comms';
  const apps = session.apps.join(', ');

  console.log('');
  console.log(chalk.bold.green(comms ? '\u25CF Comms mode active' : '\u25CF Focus session active'));
  console.log(chalk.dim('\u2500'.repeat(29)));
  console.log(`  ${chalk.bold(comms ? 'Apps open:     ' : 'Apps blocked:  ')} ${chalk.yellow(apps)}`);

  if (session.endsAt) {
    const remaining = new Date(session.endsAt) - Date.now();
    console.log(`  ${chalk.bold('Time remaining:')} ${chalk.cyan(formatTimeRemaining(remaining))}`);
    console.log(`  ${chalk.bold('Ends at:')}        ${chalk.dim(new Date(session.endsAt).toLocaleTimeString())}`);
  } else {
    console.log(`  ${chalk.bold('Ends:')}           ${chalk.dim('no auto-close \u2014 run `focus stop`')}`);
  }

  console.log(chalk.dim('\u2500'.repeat(29)));
  console.log('');
}

export function showNoSession() {
  console.log(chalk.dim('No active session. Run `focus start` to focus, or `focus comms` to open your comms apps.'));
}

export function showSuccess(msg) {
  console.log(chalk.green('✔ ' + msg));
}

export function showError(msg) {
  console.error(chalk.red('✖ ' + msg));
}

export function showWarn(msg) {
  console.warn(chalk.yellow('⚠ ' + msg));
}

export function showCountdown(seconds, message) {
  return new Promise((resolve, reject) => {
    let remaining = seconds;
    process.stdout.write(`${message} ${chalk.yellow(remaining + 's')}  `);

    const interval = setInterval(() => {
      remaining--;
      process.stdout.write(`\r${message} ${chalk.yellow(remaining + 's')}  `);
      if (remaining <= 0) {
        clearInterval(interval);
        process.stdout.write('\n');
        resolve();
      }
    }, 1000);

    // Allow Ctrl+C to cancel
    const onSigint = () => {
      clearInterval(interval);
      process.stdout.write('\n');
      reject(new Error('Cancelled by user'));
    };
    process.once('SIGINT', onSigint);

    // Clean up listener after countdown
    const origResolve = resolve;
    resolve = () => {
      process.removeListener('SIGINT', onSigint);
      origResolve();
    };
  });
}

export function formatTimeRemaining(ms) {
  if (ms <= 0) return '0s';
  const totalSecs = Math.floor(ms / 1000);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const parts = [];
  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
  return parts.join(' ');
}
