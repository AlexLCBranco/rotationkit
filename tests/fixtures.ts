// Load gzipped raw fixture games (tests/fixtures/<id>.raw.json.gz).

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { normalizeGame } from '../src/domain/normalize.ts';
import type { RawGame } from '../src/domain/raw.ts';
import type { Game } from '../src/domain/types.ts';

const DIR = join(import.meta.dirname, 'fixtures');

export const fixtureIds = readdirSync(DIR)
  .filter((f) => f.endsWith('.raw.json.gz'))
  .map((f) => f.slice(0, 10))
  .sort();

export const loadRawFixture = (id: string): RawGame => JSON.parse(gunzipSync(readFileSync(join(DIR, `${id}.raw.json.gz`))).toString());

const cache = new Map<string, Game>();
export function loadFixtureGame(id: string): Game {
  if (!cache.has(id)) cache.set(id, normalizeGame(loadRawFixture(id)));
  return structuredClone(cache.get(id)!);
}
