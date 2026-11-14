// Did-not-play labels from the source's reason codes (box score `notPlayingReason` / inactive list reasons), never
// guessed: *_COACH → "DNP – CD" (available, coach's decision); *_INJURY and concussion protocol → "OUT – injury/illness";
// any other code → its own words in a neutral style (G League, two-way, personal, rest, suspension, not with team…);
// no code → plain "DNP" (box-score player) or "Inactive" (on the official inactive list, which gives no reason).

import { reasonText } from './labels.ts';

export type DnpKind = 'cd' | 'injury' | 'other' | 'plain';
export interface DnpLabel {
  kind: DnpKind;
  /** Short tag text: "DNP – CD", "OUT – injury/illness", "G League (two-way)", "DNP". */
  tag: string;
  /** The source's detail (e.g. "Left Ankle; Sprain"), when it has one and the tag does not already say it. */
  detail?: string;
}

export function dnpLabel(reason: string | undefined, detail: string | undefined, onInactiveList = false): DnpLabel {
  const d = detail?.trim() || undefined;
  if (!reason) return { kind: 'plain', tag: onInactiveList ? 'Inactive' : 'DNP', ...(d ? { detail: d } : {}) };
  if (/_COACH$/.test(reason)) return { kind: 'cd', tag: 'DNP – CD', ...(d ? { detail: d } : {}) };
  if (/_INJURY$|_CONCUSSION_PROTOCOL$/.test(reason)) return { kind: 'injury', tag: 'OUT – injury/illness', ...(d ? { detail: d } : {}) };
  const tag = reasonText(reason) ?? reason;
  // Details that only repeat the tag ("G League - Two-Way", "Personal", "Not With Team") are dropped.
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z]/g, '');
  return { kind: 'other', tag, ...(d && !norm(tag).includes(norm(d)) && !norm(d).includes(norm(tag)) ? { detail: d } : {}) };
}

/** One line for tooltips and readouts: "OUT – injury/illness: Left Ankle; Sprain". */
export const dnpText = (l: DnpLabel) => (l.detail ? `${l.tag}: ${l.detail}` : l.tag);
