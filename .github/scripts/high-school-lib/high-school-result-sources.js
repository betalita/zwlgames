'use strict';

const { SEASON } = require('./high-school-roster');
const { BALLFROG_URL } = require('./high-school-records');
const { readGameCards, verifyTeam } = require('./high-school-neprep');

const PREP_TEAMS = {
  'phelps-national': { id: 261681, title: 'Phelps School National (PA)' },
  'peddie-varsity': { id: 261677, title: 'Peddie School (NJ)' },
};
const OPPONENT_ALIASES = {
  'wasatch-national': { 'oak cliff faith family academy': 'faith family' },
  'providence-tn-varsity': { mba: 'montgomery bell academy', mcmallie: 'mccallie' },
  'peddie-varsity': { 'notre dame (ny)': 'notre dame prep (ny)' },
  'phelps-national': { perkiomen: 'perkiomen school national (pa)', 'springdale prep': 'springdale preparatory school (md)' },
};

function matchupKey(schoolId, date, opponent) {
  const name = opponent.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
  return date + ':' + (OPPONENT_ALIASES[schoolId]?.[name] || name);
}

function scorePair(winner, team, opponent) {
  const schoolScore = Number(team), opponentScore = Number(opponent);
  if (schoolScore === opponentScore || Math.max(schoolScore, opponentScore) > 250 ||
      (winner === 'W') !== (schoolScore > opponentScore)) throw Error('invalid final result');
  return { schoolScore, opponentScore };
}

function parseBallfrog(input) {
  const data = JSON.parse(input)?.data;
  const events = data?.events;
  if (!Array.isArray(events) || events.length !== data.total_item_count || data.has_more_after || data.next_cursor)
    throw Error('incomplete Ballfrog feed');
  const ids = new Set();
  const finals = [];
  for (const event of events) {
    if (event?.team?.id !== 12146 || event.team.title !== 'Basketball Boys - HS')
      throw Error('Ballfrog team identity mismatch');
    if (!Number.isInteger(event.id) || ids.has(event.id)) throw Error('invalid Ballfrog event ID');
    ids.add(event.id);
    const opponent = /^\(V\)\s+(.+)$/.exec(event.opponent || '')?.[1]?.trim();
    if (event.event_type !== 'game' || !opponent || event.result == null || /\bscrimmage\b/i.test(opponent)) continue;
    const result = /^([WL])\s+(\d{1,3})\s*[-–]\s*(\d{1,3})$/.exec(String(event.result).trim());
    if (!result || !/^20\d\d-\d\d-\d\d$/.test(event.date) ||
      !Number.isFinite(Date.parse(event.date)) || new Date(event.date).toISOString().slice(0,10) !== event.date)
      throw Error('invalid Ballfrog result');
    if (event.date < '2026-07-01' || event.date > '2027-06-30') continue;
    const localTime = /^((?:[01]\d|2[0-3]):[0-5]\d):00$/.exec(event.time || '')?.[1];
    const timeZone = ['America/Chicago', 'America/New_York'].includes(event.timezone) ? event.timezone : null;
    finals.push({ date: event.date, opponent, ...scorePair(result[1], result[2], result[3]),
      sourceUrl: BALLFROG_URL, ...(localTime && timeZone ? { localTime, timeZone } : {}) });
  }
  return finals;
}

function prepUrl(schoolId) {
  const team = PREP_TEAMS[schoolId];
  return team ? 'https://www.neprepbasketball.net/team/' + team.id + '/games' : null;
}

function parsePrepFinals(schoolId, html) {
  const team = PREP_TEAMS[schoolId];
  if (!team) throw Error('unregistered NEPrep team');
  verifyTeam(html, team.title, team.id);
  const cards = readGameCards(html);
  if (!cards.length) throw Error('NEPrep games missing');
  return cards.filter(card => card.final).map(card => {
    const result = /^(\d{1,3})\s*[-–]\s*(\d{1,3})\s*\(([WL])\)$/.exec(card.score);
    if (!result || card.date < '2026-07-01' || card.date > '2027-06-30')
      throw Error('invalid NEPrep final result');
    return { date: card.date, opponent: card.opponent, ...scorePair(result[3], result[1], result[2]),
      sourceUrl: prepUrl(schoolId) };
  });
}

function applyFinals(schoolId, games, finals) {
  const keyFor = row => matchupKey(schoolId, row.date, row.opponent);
  const byFixture = new Map();
  for (const final of finals) {
    const key = keyFor(final);
    byFixture.set(key, byFixture.has(key) ? null : final);
  }
  const counts = new Map();
  for (const game of games) {
    if (game.schoolId !== schoolId || game.season !== SEASON) continue;
    const key = keyFor(game);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let updated = 0;
  const result = games.map(game => {
    if (game.schoolId !== schoolId || game.season !== SEASON || game.scheduleStatus || game.state === 'post') return game;
    const key = keyFor(game);
    const final = byFixture.get(key);
    if (!final || counts.get(key) !== 1) return game;
    const { schoolScore, opponentScore, sourceUrl, localTime, timeZone } = final;
    updated++;
    return { ...game, state: 'post', schoolScore, opponentScore, sourceUrl, bootstrap: false,
      ...(localTime && timeZone ? { localTime, timeZone } : {}) };
  });
  return { games: result, updated };
}

module.exports = { BALLFROG_URL, prepUrl, parseBallfrog, parsePrepFinals, applyFinals };
