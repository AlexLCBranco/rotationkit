// Short player names for labels: family name, or "F. Wagner" when two team-mates share it.

export interface Named {
  id: number;
  name: string;
  last?: string;
  nameI?: string;
}

const SUFFIX = /^(jr\.?|sr\.?|ii|iii|iv|v)$/i;

/** Family name from the source, else the last word of the full name that isn't a suffix. */
export function familyName(p: Named): string {
  if (p.last) return p.last;
  const words = p.name.split(/\s+/);
  while (words.length > 1 && SUFFIX.test(words[words.length - 1]!)) words.pop();
  return words[words.length - 1] ?? p.name;
}

function initialName(p: Named): string {
  if (p.nameI) return p.nameI;
  const first = p.name.split(/\s+/)[0] ?? '';
  return `${first.charAt(0)}. ${familyName(p)}`;
}

/** Short names for a set of team-mates (everyone who was on the team in the season). */
export function shortNames(players: Named[]): Map<number, string> {
  const unique = new Map<number, Named>();
  for (const p of players) if (!unique.has(p.id)) unique.set(p.id, p);
  const count = new Map<string, number>();
  for (const p of unique.values()) count.set(familyName(p), (count.get(familyName(p)) ?? 0) + 1);
  const out = new Map<number, string>();
  for (const p of unique.values()) out.set(p.id, (count.get(familyName(p)) ?? 0) > 1 ? initialName(p) : familyName(p));
  // Still ambiguous (e.g. Jalen and Jaylin Williams are both "J. Williams"): use the full name.
  const seen = new Map<string, number>();
  for (const n of out.values()) seen.set(n, (seen.get(n) ?? 0) + 1);
  for (const p of unique.values()) if ((seen.get(out.get(p.id)!) ?? 0) > 1) out.set(p.id, p.name);
  return out;
}
