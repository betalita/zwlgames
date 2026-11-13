'use strict';

const { createHash } = require('node:crypto');
const { chinaDate } = require('./transform');
const { LEAGUE, SEASON, SCHOOLS, HIGH_SCHOOL_PLAYERS } = require('./high-school-roster');

const extraHosts = ['nikeeyblscholastic.com', 'grindsession.com', 'grindsession.sportstrack.app',
  'www.maxpreps.com', 'legitgm.com', 'tssaasports.com', 'www.mshsaa.org', 'www.bellavistacollegeprep.com', 'www.neprepbasketball.net'];

function sourceUrl(value, schoolId) {
  let url;
  try { url = new URL(value); } catch { throw new Error('invalid high school source URL'); }
  const hosts = [...Object.values(SCHOOLS).map(school => new URL(school.url).hostname), ...extraHosts];
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443' ||
      !hosts.includes(url.hostname) || url.href.length > 500) throw new Error('unapproved high school source URL');
  return url.href;
}

function gameTime(record) {
  const { date, localTime } = record;
  const timeZone = record.timeZone || SCHOOLS[record.schoolId]?.timeZone;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) &&
    new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
  if (!valid) throw new Error('invalid high school game date');
  if (!['America/New_York','America/Chicago','America/Denver','America/Phoenix','America/Los_Angeles',
    'America/Puerto_Rico'].includes(timeZone)) throw new Error('unsupported venue time zone');
  // This placeholder is deliberately paired with timeKnown=false and a source
  // date. It never schedules a tip-off reminder or an active provider check.
  if (!localTime) return { startsAt: `${date} 12:00:00`, dateKey: date, timeKnown: false, timeZone };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) throw new Error('invalid tipoff time');
  const target = `${date}T${localTime}`;
  const local = Date.parse(`${target}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const candidates = [4,5,6,7,8].map(offset => new Date(local + offset * 3600000)).filter(at => {
    const p = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}` === target;
  });
  if (candidates.length !== 1) throw new Error('ambiguous or nonexistent local tipoff time');
  const iso = candidates[0].toISOString();
  return { startsAt: iso.slice(0, 19).replace('T',' '), dateKey: chinaDate(iso), timeKnown: true, timeZone };
}

function statsMap(input, score) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid player stats');
  const result = {};
  for (const [label, value] of Object.entries(input)) {
    if (['PTS','REB','AST','STL','BLK','TO','PF','OREB','DREB'].includes(label)) {
      if (!/^\d{1,3}$/.test(String(value)) || Number(value) > (label === 'PTS' ? score : 100))
        throw new Error(`invalid player stat ${label}`);
    } else if (label === 'MIN') {
      if (!/^(?:\d{1,2}(?:\.[0-9])?|\d{1,2}:[0-5]\d|<1)$/.test(String(value))) throw new Error('invalid MIN stat');
    } else if (['FG','3PT','FT'].includes(label)) {
      const pair = /^(\d{1,3})-(\d{1,3})$/.exec(String(value));
      if (!pair || Number(pair[1]) > Number(pair[2])) throw new Error(`invalid shooting stat ${label}`);
    } else throw new Error(`unknown player stat ${label}`);
    result[label] = String(value);
  }
  if (!Object.keys(result).length) throw new Error('empty player stats');
  if (result.FG && result['3PT'] && result.FT && result.PTS != null &&
      2 * Number(result.FG.split('-')[0]) + Number(result['3PT'].split('-')[0]) + Number(result.FT.split('-')[0]) !== Number(result.PTS))
    throw new Error('player points disagree with shooting stats');
  return result;
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object' || !SCHOOLS[record.schoolId]) throw new Error('unknown high school team/school');
  if (record.season !== SEASON || record.date < '2026-07-01' || record.date > '2027-06-30') throw new Error('unverified high school season');
  if (!['pre','post'].includes(record.state)) throw new Error('high school live states are disabled');
  if (record.scheduleStatus != null && (!['cancelled','postponed'].includes(record.scheduleStatus) || record.state !== 'pre'))
    throw new Error('invalid schedule cancellation/postponement');
  if (record.sourceNativeId != null && !/^[a-zA-Z0-9_-]{1,48}$/.test(record.sourceNativeId)) throw new Error('invalid source native id');
  if (!['home','away','neutral','unknown'].includes(record.venue)) throw new Error('invalid game venue');
  if (record.opponentSchoolId && (!SCHOOLS[record.opponentSchoolId] || record.opponentSchoolId === record.schoolId))
    throw new Error('invalid opponent school');
  if (typeof record.id !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(record.id)) throw new Error('invalid stable game id');
  if (typeof record.opponent !== 'string' || !record.opponent.trim() || record.opponent.length > 120 || /[<>]/.test(record.opponent)) throw new Error('invalid opponent');
  const source = sourceUrl(record.sourceUrl, record.schoolId);
  if (record.location != null && (typeof record.location !== 'string' || record.location.length > 200)) throw new Error('invalid game location');
  const time = gameTime(record);
  if (record.scheduleStatus) time.timeKnown = false;
  const isFinal = record.state === 'post';
  const suppliedScores = record.schoolScore != null || record.opponentScore != null;
  if (!isFinal && (suppliedScores || record.players?.length)) throw new Error('scores and player stats require an explicit final');
  if (isFinal && (![record.schoolScore, record.opponentScore].every(n => Number.isInteger(n) && n >= 0 && n <= 250) ||
    record.schoolScore === record.opponentScore)) throw new Error('invalid final score');
  const members = HIGH_SCHOOL_PLAYERS.filter(p => p.schoolId === record.schoolId || p.schoolId === record.opponentSchoolId);
  if (record.players != null && !Array.isArray(record.players)) throw new Error('invalid player rows');
  const ids = new Set();
  for (const row of record.players || []) {
    if (!members.some(p => p.id === row?.playerId) || ids.has(row.playerId)) throw new Error('player does not belong to school or duplicate player');
    ids.add(row.playerId);
  }
  const players = members.map(member => {
    const row = record.players?.find(p => p.playerId === member.id);
    const identity = { playerId: member.id, teamId: member.schoolId };
    if (!isFinal) return { ...identity, state: 'pre', stats: null };
    if (row?.dnp === true) {
      if (!row.reason?.trim() || row.reason.length > 120 || row.stats != null) throw new Error('explicit DNP requires reason and no stats');
      return { ...identity, state: 'dnp', reason: row.reason.trim(), stats: null };
    }
    if (row?.stats) return { ...identity, state: 'ready', stats: statsMap(row.stats,
      member.schoolId === record.schoolId ? record.schoolScore : record.opponentScore) };
    return { ...identity, state: 'missing', reason: '赛后个人统计待更新', stats: null };
  });
  const metadata = { timeKnown: time.timeKnown, sourceDate: record.date, sourceDateLabel: '美国当地日期', sourceRecordId: record.id,
    sourceSchoolId: record.schoolId, neutralSite: record.venue === 'neutral', homeAwayKnown: record.venue !== 'unknown',
    sourceObservedId: record.id,
    sourceNativeId: record.sourceNativeId || null, scheduleStatus: record.scheduleStatus || null,
    sourceUrl: source, dataSource: 'high-school-official', liveSupported: false,
    venue: record.venue, location: record.location || (record.venue === 'home' ? SCHOOLS[record.schoolId].location : null), timeZone: time.timeZone };
  const school = { id: record.schoolId, name: SCHOOLS[record.schoolId].name, ...metadata,
    score: isFinal ? String(record.schoolScore) : null, winner: isFinal ? record.schoolScore > record.opponentScore : null };
  const opponent = { id: record.opponentSchoolId || 'hs-opp-' + createHash('sha256').update(record.opponent.trim().toLowerCase()).digest('hex').slice(0, 20),
    name: record.opponent.trim(), ...metadata, score: isFinal ? String(record.opponentScore) : null,
    winner: isFinal ? record.opponentScore > record.schoolScore : null };
  const home = record.venue === 'away' ? opponent : school;
  const away = record.venue === 'away' ? school : opponent;
  const eventId = 'official-hs-' + createHash('sha256').update(`${record.schoolId}:${record.id}`).digest('hex').slice(0, 32);
  return { league: LEAGUE, eventId, season: SEASON, bootstrap: record.bootstrap === true, ...time, home, away,
    state: record.state, name: `${away.name} at ${home.name}`,
    statusText: record.scheduleStatus === 'cancelled' ? '比赛取消' : record.scheduleStatus === 'postponed' ? '比赛延期（时间待确认）' :
      isFinal ? '比赛结束' : time.timeKnown ? '未开始（无直播）' : '时间待定（美国当地日期）',
    period: 0, players, schoolId: record.schoolId, sourceUrl: source };
}

module.exports = { normalizeRecord, gameTime, sourceUrl, statsMap };
