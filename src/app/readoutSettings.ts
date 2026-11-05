// What the game chart's hover readout shows. Remembered per browser (localStorage; failures fall back to defaults).

import { remember } from './hooks.ts';

export interface ReadoutSettings {
  /** Lineups at the hovered moment: both teams, the hovered player's team only, or none. */
  lineups: 'both' | 'mine' | 'off';
  /** The hovered player's stint line. */
  stint: boolean;
  /** Foul counts next to lineup names. */
  fouls: boolean;
}

export const DEFAULT_READOUT: ReadoutSettings = { lineups: 'both', stint: true, fouls: true };
const KEY = 'rk.readout';

export function loadReadout(): ReadoutSettings {
  try {
    const v = JSON.parse(remember(KEY) ?? 'null') as Partial<ReadoutSettings> | null;
    if (!v || typeof v !== 'object') return DEFAULT_READOUT;
    return {
      lineups: v.lineups === 'mine' || v.lineups === 'off' || v.lineups === 'both' ? v.lineups : DEFAULT_READOUT.lineups,
      stint: typeof v.stint === 'boolean' ? v.stint : DEFAULT_READOUT.stint,
      fouls: typeof v.fouls === 'boolean' ? v.fouls : DEFAULT_READOUT.fouls,
    };
  } catch {
    return DEFAULT_READOUT;
  }
}

export function saveReadout(s: ReadoutSettings) {
  remember(KEY, JSON.stringify(s));
}
