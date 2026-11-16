/** Games (one game, whole) | By day (every game of one day) | Q4 (same game, 4th quarter + OT) | Averages | Leaders
 *  (league-wide Q4 / 2nd-half leaders) | Full Q4 (who played the whole 4th quarter, season leaderboard). */
export type TabId = 'games' | 'day' | 'q4' | 'averages' | 'leaders' | 'fullq4';

export function Tabs({ active, go }: { active: TabId; go: (tab: TabId) => void }) {
  const tab = (id: TabId, label: string) => (
    <button aria-current={active === id ? 'page' : undefined} onClick={() => active !== id && go(id)} data-testid={`tab-${id}`}>
      {label}
    </button>
  );
  return (
    <nav className="tabs" aria-label="View">
      {tab('games', 'Games')}
      {tab('day', 'By day')}
      {tab('q4', 'Q4')}
      {tab('averages', 'Averages')}
      {tab('leaders', 'Leaders')}
      {tab('fullq4', 'Full Q4')}
    </nav>
  );
}
