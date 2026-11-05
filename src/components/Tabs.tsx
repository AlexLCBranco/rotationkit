/** Games (one game, whole) | Q4 (same game, 4th quarter + OT) | Averages | Leaders (league-wide Q4 / 2nd-half leaders). */
export type TabId = 'games' | 'q4' | 'averages' | 'leaders';

export function Tabs({ active, go }: { active: TabId; go: (tab: TabId) => void }) {
  const tab = (id: TabId, label: string) => (
    <button aria-current={active === id ? 'page' : undefined} onClick={() => active !== id && go(id)} data-testid={`tab-${id}`}>
      {label}
    </button>
  );
  return (
    <nav className="tabs" aria-label="View">
      {tab('games', 'Games')}
      {tab('q4', 'Q4')}
      {tab('averages', 'Averages')}
      {tab('leaders', 'Leaders')}
    </nav>
  );
}
