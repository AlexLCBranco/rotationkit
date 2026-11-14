// What the game chart's hover readout shows (and the points-on-bars option, game chart and player page). Remembered per browser (localStorage; failures fall back to defaults).

import { remember } from './hooks.ts';

export interface ReadoutSettings {
  /** Lineups at the hovered moment: both teams, the hovered player's team only, or none. */
  lineups: 'both' | 'mine' | 'off';
  /** The hovered player's stint line. */
  stint: boolean;
  /** Foul counts next to lineup names. */
  fouls: boolean;
  /** Points scored in each stint on its bar ("12:00 · 8p"), when the bar is long enough. */
  barPoints: boolean;
}

export const DEFAULT_READOUT: ReadoutSettings = { lineups: 'both', stint: true, fouls: true, barPoints: false };
const KEY = 'rk.readout';

export function loadReadout(): ReadoutSettings {
  try {
    const v = JSON.parse(remember(KEY) ?? 'null') as Partial<ReadoutSettings> | null;
    if (!v || typeof v !== 'object') return DEFAULT_READOUT;
    return {
      lineups: v.lineups === 'mine' || v.lineups === 'off' || v.lineups === 'both' ? v.lineups : DEFAULT_READOUT.lineups,
      stint: typeof v.stint === 'boolean' ? v.stint : DEFAULT_READOUT.stint,
      fouls: typeof v.fouls === 'boolean' ? v.fouls : DEFAULT_READOUT.fouls,
      barPoints: typeof v.barPoints === 'boolean' ? v.barPoints : DEFAULT_READOUT.barPoints,
    };
  } catch {
    return DEFAULT_READOUT;
  }
}

export function saveReadout(s: ReadoutSettings) {
  remember(KEY, JSON.stringify(s));
}
