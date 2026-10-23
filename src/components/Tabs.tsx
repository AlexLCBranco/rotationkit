/** Main screen (one game) vs the secondary Averages view. */
export function Tabs({ active, onGames, onAverages }: { active: 'games' | 'averages'; onGames: () => void; onAverages: () => void }) {
  return (
    <nav className="tabs" aria-label="View">
      <button aria-current={active === 'games' ? 'page' : undefined} onClick={onGames} data-testid="tab-games">
        Games
      </button>
      <button aria-current={active === 'averages' ? 'page' : undefined} onClick={onAverages} data-testid="tab-averages">
        Averages
      </button>
    </nav>
  );
}
