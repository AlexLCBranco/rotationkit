// Two small icon links on the score line (Games and Q4): the game on hoopsjunkie and in calendarkit (new tab).

import { calendarkitUrl, hoopsjunkieUrl } from '../app/gameLinks.ts';
import type { Game } from '../domain/types.ts';

export function GameLinks({ g }: { g: Game }) {
  return (
    <span className="game-links">
      <a className="icon-link" href={hoopsjunkieUrl(g)} target="_blank" rel="noopener noreferrer" title="Open on hoopsjunkie" aria-label="Open on hoopsjunkie" data-testid="link-hoopsjunkie">
        {/* basketball */}
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3v18M5.6 5.6c3.2 3 3.2 9.8 0 12.8M18.4 5.6c-3.2 3-3.2 9.8 0 12.8" />
        </svg>
      </a>
      <a className="icon-link" href={calendarkitUrl(g)} target="_blank" rel="noopener noreferrer" title="Open in calendarkit" aria-label="Open in calendarkit" data-testid="link-calendarkit">
        {/* calendar */}
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3.5" y="5" width="17" height="15" rx="2" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" />
          <rect x="7" y="12.5" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
        </svg>
      </a>
    </span>
  );
}
