// The one link component for players and one for teams, used wherever a name is shown. Real <a href="#/…"> links:
// Ctrl/middle-click opens a new tab, the back button works. They look like plain text until hovered (underline +
// pointer). A click on the link never reaches the row/chart under it (no row select, no cursor pin).

import { createContext, useContext, type ReactNode } from 'react';
import { playerHref, teamHref, type LinkContext } from '../app/links.ts';

/** The current screen's season, filters and team (+ the seasons, for the search). Absent → names render as plain text. */
export const LinkCtx = createContext<(LinkContext & { seasons: string[] }) | null>(null);
export const useLinkContext = () => useContext(LinkCtx);

interface Common {
  children: ReactNode;
  className?: string;
  title?: string;
}

export function PlayerLink({ id, team, season, children, className, title }: Common & { id: number; team: string; season?: string }) {
  const c = useContext(LinkCtx);
  if (!c) return <span className={className}>{children}</span>;
  return (
    <a
      className={`plain-link${className ? ` ${className}` : ''}`}
      href={playerHref(c, { id, team, ...(season ? { season } : {}) })}
      title={title}
      onClick={(e) => e.stopPropagation()}
      data-testid="player-link"
      data-player={id}
    >
      {children}
    </a>
  );
}

export function TeamLink({ team, season, children, className, title }: Common & { team: string; season?: string }) {
  const c = useContext(LinkCtx);
  if (!c || !team) return <span className={className}>{children}</span>;
  return (
    <a className={`plain-link${className ? ` ${className}` : ''}`} href={teamHref(c, team, season)} title={title} onClick={(e) => e.stopPropagation()} data-testid="team-link" data-team={team}>
      {children}
    </a>
  );
}
