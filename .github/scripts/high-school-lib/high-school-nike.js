'use strict';

const { HIGH_SCHOOL_PLAYERS, SEASON } = require('./high-school-roster');

const NIKE_SEASON = '193f1b84-b3e3-5e82-aa91-183ae97594e9';
const NIKE_FIXTURES = 'https://scholastic.nikeeyb.com/api/current/fixtures';
const NIKE_BOX_PREFIX = 'https://scholastic.nikeeyb.com/api/current/games/';
const UUID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/;
const SCHOOLS = {
  'wasatch-national': ['8c2ff07e-3b47-51cf-995e-c648db83ce5a', 'Wasatch Academy'],
  'veritas-national': ['57ecec1a-9f83-57da-afc4-81d96c01e74c', 'Veritas Academy'],
  'bella-vista': ['adc9f0a7-3045-5d84-906f-cfbb2d05dbab', 'CIA Bella Vista'],
};
const PLAYER_IDS = {
  zhangyuchen: '7d395181-d9b5-462f-947f-738c482416f6',
  zhangyizhaojie: 'ce068565-db58-5e84-9823-110a076233df',
  yangyixuan: '6b471b78-8ffb-5c46-a306-94917076ee62',
};
const normalizeName = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
const opponentKey = value => ({ azcompass: 'azcompassprep', ocffa: 'faithfamily',
  oakclifffaithfamilyacademy: 'faithfamily' })[normalizeName(value)] || normalizeName(value);
const schoolOf = side => Object.keys(SCHOOLS).find(id => SCHOOLS[id][0] === side?.id && SCHOOLS[id][1] === side?.name);
const statKeys = { PTS: 'points', REB: 'rebounds', AST: 'assists', STL: 'steals', BLK: 'blocks', TO: 'turnovers', PF: 'fouls' };
const shots = { FG: ['fgm', 'fga'], '3PT': ['tpm', 'tpa'], FT: ['ftm', 'fta'] };
const count = n => Number.isInteger(n) && n >= 0;

function preserveMediaFields(candidate, previous) {
  if (!previous?.evidence || candidate.schoolScore !== previous.schoolScore || candidate.opponentScore !== previous.opponentScore)
    return;
  const source = previous.evidence.sourceUrl;
  const players = new Map(candidate.players.map(row => [row.playerId, row]));
  for (const old of previous.players || []) {
    const player = players.get(old.playerId);
    if (player?.dnp) continue;
    const missing = Object.entries(old.stats || {}).filter(([label]) =>
      old.statSources?.[label] === source && player?.stats?.[label] == null);
    if (!missing.length) continue;
    players.set(old.playerId, { playerId: old.playerId, stats: { ...player?.stats, ...Object.fromEntries(missing) },
      statSources: { ...Object.fromEntries(Object.keys(player?.stats || {}).map(label => [label, candidate.sourceUrl])),
        ...Object.fromEntries(missing.map(([label]) => [label, source])) } });
    candidate.evidence = previous.evidence;
  }
  candidate.players = [...players.values()];
}

function isNikeSource(value, record) {
  const nativeId = record?.sourceNativeId;
  if (typeof nativeId !== 'string') return false;
  const id = nativeId.slice(5);
  if (!nativeId.startsWith('nike-') || !UUID.test(id) || !Object.hasOwn(SCHOOLS, record.schoolId) ||
      (record.opponentSchoolId && !Object.hasOwn(SCHOOLS, record.opponentSchoolId))) return false;
  if (value === NIKE_FIXTURES) return !record.players?.length;
  return record.state === 'post' && value === NIKE_BOX_PREFIX + id;
}

function parseNikeFixtures(input) {
  const data = JSON.parse(input);
  if (data.defaultSeason !== NIKE_SEASON || !Array.isArray(data.games) || !data.games.length || data.games.length > 500)
    throw new Error('Nike current season or fixtures mismatch');
  const games = new Map();
  for (const game of data.games) {
    const a = schoolOf(game.a), b = schoolOf(game.b);
    if (!a && !b) continue;
    if (!UUID.test(game.id) || game.seasonId !== NIKE_SEASON || game.seasonName !== '2026-27' ||
      !UUID.test(game.a?.id) || !UUID.test(game.b?.id) || game.a.id === game.b.id ||
      !game.a.name || !game.b.name || !/^\d{4}-\d\d-\d\d$/.test(game.date))
      throw new Error('Nike fixture identity mismatch');
    if (games.has(game.id)) throw new Error('Nike duplicate fixture ID');
    games.set(game.id, game);
  }
  if (!games.size) throw new Error('Nike tracked fixtures missing');
  return games;
}

function parseStats(row, score) {
  const seconds = Math.round(row.minutes * 60);
  const stats = {};
  if (typeof row.minutes === 'number' && Number.isFinite(seconds) && seconds >= 0 && seconds <= 3600)
    stats.MIN = Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  for (const [label, field] of Object.entries(statKeys)) if (count(row[field])) stats[label] = row[field];
  for (const [label, [made, attempts]] of Object.entries(shots)) {
    if (count(row[made]) && count(row[attempts])) stats[label] = row[made] + '-' + row[attempts];
  }
  return require('./high-school-records').statsMap(stats, score);
}

function parseNikeBox(input, fixture) {
  const box = JSON.parse(input);
  if (box.id !== fixture.id || box.seasonId !== NIKE_SEASON || box.date !== fixture.date ||
    box.status !== 'final' || !box.hasBox || box.stale !== false || box.feedUnavailable !== false ||
    box.boxSource !== 'cerebro' || !Array.isArray(box.teams) || box.teams.length !== 2)
    throw new Error('Nike final box identity or freshness mismatch');
  const players = [];
  for (const side of [fixture.a, fixture.b]) {
    const matching = box.teams.filter(team => team.id === side.id && team.name === side.name);
    const [team] = matching;
    if (matching.length !== 1 || team.score !== side.score || team.total?.points !== side.score ||
      !Array.isArray(team.players) || team.players.length > 30 ||
      team.players.some(row => !count(row.points) && row.points != null) ||
      team.players.reduce((sum, row) => sum + (row.points ?? 0), 0) !== side.score)
      throw new Error('Nike player and team points disagree');
    for (const [made, attempts] of Object.values(shots)) for (const field of [made, attempts]) {
      if (team.total[field] != null && team.players.reduce((sum, row) => sum + (row[field] ?? 0), 0) !== team.total[field])
        throw new Error('Nike player and team shooting disagree');
    }
    const schoolId = schoolOf(side);
    for (const member of HIGH_SCHOOL_PLAYERS.filter(player => player.schoolId === schoolId)) {
      const names = [member.englishName, ...(member.aliases || [])].map(normalizeName);
      const matches = team.players.filter(row => row.id === PLAYER_IDS[member.id] || names.includes(normalizeName(row.name)));
      if (matches.length > 1) throw new Error('Nike player identity is ambiguous');
      const [player] = matches;
      if (player && (player.id !== PLAYER_IDS[member.id] || !names.includes(normalizeName(player.name))))
        throw new Error('Nike player name or athlete ID mismatch');
      if (player?.participation === 'dnp') {
        if (['minutes', ...Object.values(statKeys), ...Object.values(shots).flat()]
          .some(field => player[field] != null && player[field] !== 0)) throw new Error('Nike DNP has game statistics');
        players.push({ playerId: member.id, dnp: true, reason: 'Nike EYBL 官方技术统计明确列为未出场' });
      }
      if (player?.participation === 'played') players.push({ playerId: member.id, stats: parseStats(player, team.score) });
    }
  }
  return players;
}

async function collectNike(schoolId, current, previous, fixtures, read, { now, due, onWarning = () => {} }) {
  if (!Object.hasOwn(SCHOOLS, schoolId)) return current;
  const records = new Map(current.map(row => [row.id, row]));
  const known = new Map([...previous, ...current].filter(row => Object.hasOwn(SCHOOLS, row.schoolId))
    .map(row => [row.id, row]));
  for (const row of previous) {
    const latest = known.get(row.id);
    if (row.state === 'post' && latest && (latest.state !== 'post' || row.players?.length && !latest.players?.length))
      known.set(row.id, row);
  }
  let boxes = 0;
  const earliest = now.toISOString().slice(0, 10);
  const recentFrom = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  const fixtureKey = game => [game.date, ...[game.a.id, game.b.id].sort()].join(':');
  const counts = new Map();
  for (const game of fixtures.values()) {
    const key = fixtureKey(game);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  for (const game of fixtures.values()) {
    const a = schoolOf(game.a), b = schoolOf(game.b);
    if (![a, b].includes(schoolId) || !['scheduled', 'final'].includes(game.status)) continue;
    const native = 'nike-' + game.id;
    const sameNative = [...known.values()].filter(row => row.sourceNativeId === native);
    const matchesTeams = row => {
      if (row.schoolId !== a && row.schoolId !== b) return false;
      const followsAway = row.schoolId === a;
      const opponentSchoolId = followsAway ? b : a;
      const rival = followsAway ? game.b : game.a;
      return row.opponentSchoolId ? row.opponentSchoolId === opponentSchoolId :
        opponentKey(row.opponent) === opponentKey(rival.name);
    };
    if (sameNative.some(row => !matchesTeams(row))) { onWarning('changed teams for Nike fixture ' + game.id); continue; }
    const sameDate = [...known.values()].filter(row => row.date === game.date && matchesTeams(row));
    const repeatedPair = counts.get(fixtureKey(game)) > 1;
    if (repeatedPair && !sameNative.length) { onWarning('repeated Nike teams and date for fixture ' + game.id); continue; }
    const sameFixture = sameNative.length ? sameNative : sameDate;
    if (sameFixture.length > 1) { onWarning('ambiguous Nike fixture ' + game.id); continue; }
    const [match] = sameFixture;
    const owner = match?.schoolId || Object.keys(SCHOOLS).find(id => id === a || id === b);
    const own = owner === a ? game.a : game.b, away = own === game.a;
    const rival = away ? game.b : game.a, opponentSchoolId = away ? b : a;
    if (match?.scheduleStatus || (due && (!match || !due.has(match.schoolId + ':' + match.id)))) continue;
    if (!due && !match && game.date < recentFrom) continue;
    if (!match && [...known.values()].some(row => row.schoolId === owner && row.date === game.date)) {
      onWarning('same-date opponent conflict for Nike fixture ' + game.id); continue;
    }
    const final = game.status === 'final';
    if (final && (!count(own.score) || !count(rival.score) || own.score === rival.score ||
      game.date > earliest || !(Date.parse(game.time) <= now.getTime()))) continue;
    if (match?.state === 'post' && (!final || ((match.schoolScore !== own.score || match.opponentScore !== rival.score) &&
      !require('./high-school-media-evidence').isMediaUrl(match.sourceUrl)))) continue;
    const hasTipoff = /^\d\d:\d\d:00$/.test(game.localTime);
    const previousTiming = match?.date === game.date ? match : null;
    const localTime = hasTipoff ? game.localTime.slice(0, 5) : previousTiming?.localTime;
    const candidate = { id: match?.id || native, sourceNativeId: native, schoolId: owner, season: SEASON,
      date: game.date, localTime, timeZone: hasTipoff ? game.timeZone : previousTiming?.timeZone || game.timeZone,
      location: game.venue || previousTiming?.location,
      opponent: match?.opponent || rival.name, opponentSchoolId,
      venue: /^(?:On Campus Game|Home Games(?: — .+)?)$/.test(game.label) ? (away ? 'away' : 'home') :
        previousTiming?.venue || 'unknown',
      state: final ? 'post' : 'pre', sourceUrl: NIKE_FIXTURES };
    if (final) {
      candidate.schoolScore = own.score;
      candidate.opponentScore = rival.score;
      candidate.players = [];
      if (game.hasBox && game.date >= recentFrom && boxes < 4) {
        boxes++;
        try {
          const source = NIKE_BOX_PREFIX + game.id;
          candidate.players = parseNikeBox(await read(source), game);
          candidate.sourceUrl = source;
        } catch (error) { onWarning(error.message); }
      }
    }
    if (final && match?.state === 'post' && match.players?.length && !candidate.players.length) {
      records.set(match.id, match);
      continue;
    }
    try {
      if (final && candidate.players.length) preserveMediaFields(candidate, match);
      const normalized = require('./high-school-records').normalizeRecord(candidate);
      if (hasTipoff && Date.parse(normalized.startsAt.replace(' ', 'T') + 'Z') !== Date.parse(game.time))
        throw new Error('Nike fixture tipoff time mismatch');
      if (sameNative.length && !repeatedPair) {
        const duplicate = sameDate.filter(row => row.id !== candidate.id);
        if (duplicate.length === 1 && duplicate[0].state === 'pre' && !duplicate[0].sourceNativeId?.startsWith('nike-') &&
          !previous.some(row => row.id === duplicate[0].id)) records.delete(duplicate[0].id);
      }
      records.set(candidate.id, candidate);
    } catch (error) { onWarning(error.message); }
  }
  return [...records.values()];
}

module.exports = { NIKE_SEASON, NIKE_FIXTURES, NIKE_BOX_PREFIX, isNikeSource, parseNikeFixtures, collectNike };
