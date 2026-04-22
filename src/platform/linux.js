/**
 * Linux-specific process listing adapter.
 * Uses `ps -eo pid,comm` to enumerate all running processes.
 * Normalizes process names by stripping path prefixes and .exe extensions.
 * @module platform/linux
 * @platform linux
 */

import { execFileSync } from 'child_process';

/**
 * Lists all running processes on Linux.
 * Executes `ps -eo pid,comm` and parses output into array of {pid, name} objects.
 * Names are normalized (lowercased, path stripped).
 * 
 * @returns {Array<{pid: number, name: string}>} Array of all running processes
 */
export function listProcesses() {
  const output = execFileSync('ps', ['-eo', 'pid,comm'], { encoding: 'utf8' });
  return parsePs(output);
}

/**
 * Parses ps command output into {pid, name} objects.
 * Skips header line, handles whitespace-separated columns.
 * @private
 * @param {string} output - Raw ps output
 * @returns {Array<{pid: number, name: string}>} Parsed process list
 */
function parsePs(output) {
  const lines = output.trim().split('\n').slice(1); // skip header
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx === -1) continue;
    const pid = parseInt(trimmed.slice(0, spaceIdx), 10);
    const comm = trimmed.slice(spaceIdx + 1).trim();
    if (!isNaN(pid) && comm) {
      result.push({ pid, name: normalise(comm) });
    }
  }
  return result;
}

/**
 * Normalizes a process name for consistent matching.
 * Converts to lowercase, strips .exe extensions, removes path prefixes.
 * Note: Linux doesn't typically use .app extensions like macOS; focuses on .exe and paths.
 * @param {string} name - Raw process name (e.g., '/usr/bin/slack')
 * @returns {string} Normalized name (e.g., 'slack')
 */
export function normalise(name) {
  return name
    .toLowerCase()
    .replace(/\.exe$/i, '')
    .replace(/.*[/\\]/, '') // strip path
    .trim();
}
