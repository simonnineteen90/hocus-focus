import { appendFileSync } from 'fs';
import { getPaths } from './paths.js';

export function log(message) {
  const { logFile } = getPaths();
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  try {
    appendFileSync(logFile, entry, { mode: 0o600 });
  } catch {
    // Logging should never crash the process
  }
}
