/**
 * Filesystem paths module.
 * Handles platform-specific directory resolution (macOS vs XDG Linux) and ensures
 * config/state directories exist with appropriate permissions.
 * @module paths
 */

import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync } from 'fs';

/**
 * Recursively creates a directory with restrictive permissions (0o700).
 * @private
 * @param {string} dir - Directory path to create
 * @returns {string} The created directory path
 */
function ensureDir(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

/**
 * Resolves platform-specific paths for focus configuration and state files.
 * On macOS, uses ~/.focus for both config and state.
 * On Linux, respects XDG_CONFIG_HOME and XDG_STATE_HOME environment variables,
 * defaulting to ~/.config/focus and ~/.local/state/focus respectively.
 * Creates all directories with 0o700 permissions if they don't exist.
 * 
 * @returns {Object} Path object with properties: configDir, stateDir, configFile, sessionFile, lockFile, logFile, readyFile
 */
export function getPaths() {
  const home = homedir();

  let configDir, stateDir;

  if (process.platform === 'darwin') {
    configDir = join(home, '.focus');
    stateDir = join(home, '.focus');
  } else {
    const xdgConfig = process.env.XDG_CONFIG_HOME || join(home, '.config');
    const xdgState = process.env.XDG_STATE_HOME || join(home, '.local', 'state');
    configDir = join(xdgConfig, 'focus');
    stateDir = join(xdgState, 'focus');
  }

  ensureDir(configDir);
  if (stateDir !== configDir) ensureDir(stateDir);

  return {
    configDir,
    stateDir,
    configFile: join(configDir, 'config.json'),
    sessionFile: join(stateDir, 'session.json'),
    lockFile: join(stateDir, 'focus.lock'),
    logFile: join(stateDir, 'focus.log'),
    readyFile: join(stateDir, 'watcher.ready'),
  };
}
