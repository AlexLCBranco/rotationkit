// Read / write data/update-status.json (see src/domain/updateStatus.ts). No dependencies, so the workflow's
// fallback step can run it with plain `node --experimental-strip-types` even when `npm ci` failed.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { UpdateStatus } from '../../src/domain/updateStatus.ts';

export const STATUS_FILE = 'data/update-status.json';

export function readStatus(file = STATUS_FILE): UpdateStatus | null {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as UpdateStatus) : null;
  } catch {
    return null;
  }
}

export function writeStatus(s: UpdateStatus, file = STATUS_FILE) {
  writeFileSync(file, JSON.stringify(s, null, 2) + '\n');
}
