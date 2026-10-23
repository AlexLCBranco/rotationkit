// Step 0 connectivity probe: checks which NBA data endpoints are reachable
// from this environment and inspects the shape of real responses.
// Run: npm run probe   (NODE_USE_ENV_PROXY=1 makes Node's fetch use HTTPS_PROXY)

import { mkdirSync, writeFileSync } from 'node:fs';

const HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};
const TIMEOUT_MS = 15_000;
const SCHEDULE_URL = 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json';
const FALLBACK_GAME_ID = '0022600001';

type Result = { name: string; url: string; verdict: string; status?: number; ms: number; json?: any };

async function probe(name: string, url: string): Promise<Result> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const ms = Date.now() - t0;
    const text = await res.text();
    if (res.status === 403 && /host_not_allowed|not allowed/i.test(text + (res.headers.get('x-deny-reason') ?? ''))) {
      return { name, url, verdict: '403 host_not_allowed (environment network setting)', status: 403, ms };
    }
    if (!res.ok) return { name, url, verdict: `HTTP ${res.status}: ${text.slice(0, 200)}`, status: res.status, ms };
    try {
      return { name, url, verdict: 'OK', status: res.status, ms, json: JSON.parse(text) };
    } catch {
      return { name, url, verdict: `OK status but non-JSON body: ${text.slice(0, 200)}`, status: res.status, ms };
    }
  } catch (e: any) {
    const ms = Date.now() - t0;
    const msg = e?.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS / 1000}s` : `${e?.name}: ${e?.message} ${e?.cause?.message ?? ''}`;
    return { name, url, verdict: msg, ms };
  }
}

function save(name: string, json: unknown) {
  mkdirSync('.probe', { recursive: true });
  writeFileSync(`.probe/${name}.json`, JSON.stringify(json, null, 2));
}

async function main() {
  const results: Result[] = [];

  // a) schedule
  const sched = await probe('schedule', SCHEDULE_URL);
  results.push(sched);
  let gameId = FALLBACK_GAME_ID;
  if (sched.json) {
    save('schedule', sched.json);
    const ls = sched.json.leagueSchedule;
    console.log(`schedule seasonYear=${ls?.seasonYear} gameDates=${ls?.gameDates?.length}`);
    const games = (ls?.gameDates ?? []).flatMap((d: any) => d.games ?? []);
    // Regular season IDs start with 002; gameStatus 3 = final
    const finished = games.filter((g: any) => String(g.gameId).startsWith('002') && g.gameStatus === 3);
    console.log(`games=${games.length} finishedRegularSeason=${finished.length}`);
    if (finished.length) gameId = finished[0].gameId;
    else console.log(`no finished regular-season game in schedule; using fallback ${FALLBACK_GAME_ID}`);
  }
  console.log(`using gameId ${gameId}`);

  const rot = await probe('gamerotation', `https://stats.nba.com/stats/gamerotation?GameID=${gameId}&LeagueID=00`);
  const pbp = await probe('playbyplay', `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${gameId}.json`);
  const box = await probe('boxscore', `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`);
  results.push(rot, pbp, box);

  for (const r of results) console.log(`\n[${r.name}] ${r.verdict} (${r.ms}ms)\n  ${r.url}`);

  if (rot.json) {
    save('gamerotation', rot.json);
    for (const rs of rot.json.resultSets ?? []) console.log(`gamerotation set ${rs.name}: rows=${rs.rowSet?.length} headers=${rs.headers?.join(',')}`);
  }

  if (pbp.json) {
    save('playbyplay', pbp.json);
    const actions: any[] = pbp.json.game?.actions ?? [];
    const types = new Map<string, number>();
    for (const a of actions) types.set(a.actionType, (types.get(a.actionType) ?? 0) + 1);
    console.log(`\nplay-by-play actions=${actions.length}`);
    console.log('actionType counts:', Object.fromEntries(types));
    console.log('action keys:', Object.keys(actions[0] ?? {}).join(','));
    const sub = actions.find((a) => a.actionType === 'substitution');
    const foul = actions.find((a) => a.actionType === 'foul');
    console.log('sample substitution:', JSON.stringify(sub));
    console.log('sample foul:', JSON.stringify(foul));
    const scored = actions.filter((a) => a.scoreHome !== undefined && a.scoreAway !== undefined);
    console.log(`actions with scoreHome/scoreAway: ${scored.length}; last: ${scored.at(-1)?.scoreAway}-${scored.at(-1)?.scoreHome}`);
  }

  if (box.json) {
    save('boxscore', box.json);
    const g = box.json.game;
    console.log(`\nboxscore ${g?.awayTeam?.teamTricode} ${g?.awayTeam?.score} @ ${g?.homeTeam?.teamTricode} ${g?.homeTeam?.score} period=${g?.period}`);
    const players: any[] = [...(g?.homeTeam?.players ?? []), ...(g?.awayTeam?.players ?? [])];
    console.log('player keys:', Object.keys(players[0] ?? {}).join(','));
    console.log('statistics keys:', Object.keys(players[0]?.statistics ?? {}).join(','));
    const dnp = players.filter((p) => p.played !== '1');
    console.log(`players=${players.length} not played=${dnp.length}`);
    for (const p of dnp) console.log(`  ${p.name} status=${p.status} played=${p.played} notPlayingReason=${p.notPlayingReason} notPlayingDescription=${p.notPlayingDescription}`);
  }
}

main();
