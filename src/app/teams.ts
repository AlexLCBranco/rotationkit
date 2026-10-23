// Team names and one accent color each (used only as small accents on the dark theme).

export const TEAMS: Record<string, { name: string; color: string }> = {
  ATL: { name: 'Atlanta Hawks', color: '#e03a3e' },
  BKN: { name: 'Brooklyn Nets', color: '#a0a0a0' },
  BOS: { name: 'Boston Celtics', color: '#2e9e5b' },
  CHA: { name: 'Charlotte Hornets', color: '#1d8ca8' },
  CHI: { name: 'Chicago Bulls', color: '#ce1141' },
  CLE: { name: 'Cleveland Cavaliers', color: '#a34661' },
  DAL: { name: 'Dallas Mavericks', color: '#2f6bd8' },
  DEN: { name: 'Denver Nuggets', color: '#fec524' },
  DET: { name: 'Detroit Pistons', color: '#c8102e' },
  GSW: { name: 'Golden State Warriors', color: '#ffc72c' },
  HOU: { name: 'Houston Rockets', color: '#ce1141' },
  IND: { name: 'Indiana Pacers', color: '#fdbb30' },
  LAC: { name: 'LA Clippers', color: '#3a6fd8' },
  LAL: { name: 'Los Angeles Lakers', color: '#fdb927' },
  MEM: { name: 'Memphis Grizzlies', color: '#5d76a9' },
  MIA: { name: 'Miami Heat', color: '#c8102e' },
  MIL: { name: 'Milwaukee Bucks', color: '#3c8d4f' },
  MIN: { name: 'Minnesota Timberwolves', color: '#4f8ad1' },
  NOP: { name: 'New Orleans Pelicans', color: '#c8a45c' },
  NYK: { name: 'New York Knicks', color: '#f58426' },
  OKC: { name: 'Oklahoma City Thunder', color: '#3b8fd9' },
  ORL: { name: 'Orlando Magic', color: '#2f7fd8' },
  PHI: { name: 'Philadelphia 76ers', color: '#3a6fd8' },
  PHX: { name: 'Phoenix Suns', color: '#e56020' },
  POR: { name: 'Portland Trail Blazers', color: '#e03a3e' },
  SAC: { name: 'Sacramento Kings', color: '#8a63c2' },
  SAS: { name: 'San Antonio Spurs', color: '#b0b7bc' },
  TOR: { name: 'Toronto Raptors', color: '#ce1141' },
  UTA: { name: 'Utah Jazz', color: '#7a5bc7' },
  WAS: { name: 'Washington Wizards', color: '#e31837' },
};
export const TEAM_CODES = Object.keys(TEAMS).sort();
export const teamName = (tri: string) => TEAMS[tri]?.name ?? tri;
export const teamColor = (tri: string) => TEAMS[tri]?.color ?? '#8892a6';
