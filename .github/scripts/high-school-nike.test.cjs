'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { NIKE_SEASON, NIKE_FIXTURES, parseNikeFixtures, collectNike } = require('./high-school-lib/high-school-nike');

const id = '21fbc22e-5178-5442-b95b-e30e4b28ee05';
const veritas = { id: '57ecec1a-9f83-57da-afc4-81d96c01e74c', name: 'Veritas Academy', score: 0 };
const bella = { id: 'adc9f0a7-3045-5d84-906f-cfbb2d05dbab', name: 'CIA Bella Vista', score: 3 };
const game = { id, seasonId: NIKE_SEASON, seasonName: '2026-27', date: '2026-11-20',
  localTime: '17:30:00', time: '2026-11-21T00:30:00+00:00', timeZone: 'America/Phoenix',
  label: 'On Campus Game', status: 'final', hasBox: true, venue: 'Scottsdale, AZ', a: veritas, b: bella };
const row = { name: 'Yuchen Zhang', id: '7d395181-d9b5-462f-947f-738c482416f6', participation: 'played', minutes: 10.5, points: 3, rebounds: 1, assists: 2,
  steals: 0, blocks: 0, turnovers: 0, fouls: 0, fgm: 1, fga: 4, tpm: 1, tpa: 3, ftm: 0, fta: 0 };
const box = { ...game, boxSource: 'cerebro', stale: false, feedUnavailable: false, teams: [
  { ...veritas, total: { points: 0 }, players: [] },
  { ...bella, total: { points: 3, fgm: 1, fga: 4, tpm: 1, tpa: 3, ftm: 0, fta: 0 }, players: [row] },
] };
const saved = { season: 2027, id: 'seed2027-veritas-bella-vista', schoolId: 'veritas-national', opponentSchoolId: 'bella-vista',
  opponent: bella.name, date: '2026-11-20', state: 'pre' };
const now = new Date('2026-11-21T10:00:00Z');
const fixtures = { defaultSeason: NIKE_SEASON, games: [game] };

test('Nike verifies the current season and reports the same canonical fixture for both schools', async () => {
  const index = parseNikeFixtures(JSON.stringify(fixtures));
  const fetchBox = async url => { assert.match(url, /\/api\/current\/games\//); return JSON.stringify(box); };
  const collect = school => collectNike(school, [saved], [], index, fetchBox, { now });
  const [a] = await collect('veritas-national');
  const [b] = await collect('bella-vista');
  assert.deepEqual(a, b);
  assert.equal(a.id, saved.id);
  assert.equal(a.sourceNativeId, 'nike-' + id);
  assert.equal(a.state, 'post');
  assert.equal(a.localTime, '17:30');
  assert.deepEqual(a.players.map(p => [p.playerId, p.stats.MIN, p.stats.PTS]), [['zhangyuchen', '10:30', '3']]);
  assert.throws(() => parseNikeFixtures(JSON.stringify({ ...fixtures, defaultSeason: 'old' })), /season/);
  assert.throws(() => parseNikeFixtures(JSON.stringify({ ...fixtures, games: [game, game] })), /duplicate/);
});

test('Nike limits due reads and avoids using inconsistent box scores or ambiguous pairings', async () => {
  const index = parseNikeFixtures(JSON.stringify(fixtures));
  let reads = 0;
  const fetchBox = async () => { reads++; return JSON.stringify({ ...box, teams: [box.teams[0], { ...box.teams[1], players: [{ ...row, points: 2 }] }] }); };
  const scoped = await collectNike('veritas-national', [saved], [], index, fetchBox, { now, due: new Set() });
  assert.deepEqual(scoped, [saved]);
  assert.equal(reads, 0);
  const [result] = await collectNike('veritas-national', [saved], [], index, fetchBox, { now });
  assert.equal(result.state, 'post');
  assert.deepEqual(result.players, []);
  const duplicate = { ...saved, id: 'other' };
  assert.deepEqual(await collectNike('veritas-national', [saved, duplicate], [], index, fetchBox, { now }), [saved, duplicate]);
  assert.equal(reads, 1);
});

test('Nike publishes upcoming games with a provider identity and no personal stats', async () => {
  const next = { ...game, id: 'be68fa2f-b34e-5f02-8f81-3a4ca5c65ba0', date: '2026-11-24', time: '2026-11-25T00:30:00+00:00', status: 'scheduled',
    hasBox: false, a: { ...veritas, score: null }, b: { ...bella, score: null } };
  const [pending] = await collectNike('veritas-national', [], [], parseNikeFixtures(JSON.stringify({ ...fixtures, games: [next] })),
    () => assert.fail('future game cannot need a box score'), { now });
  assert.equal(pending.id, 'nike-' + next.id);
  assert.equal(pending.sourceUrl, NIKE_FIXTURES);
  assert.equal(pending.state, 'pre');
  assert.equal(pending.players, undefined);
});

test('Nike retains existing Veritas owner when the other tracked team comes first in the catalogue', async () => {
  const { normalizeRecord } = require('./high-school-lib/high-school-records');
  const wasatch = { id: '8c2ff07e-3b47-51cf-995e-c648db83ce5a', name: 'Wasatch Academy', score: null };
  const paired = { ...game, id: 'b710e837-e801-5fef-8cb9-fd6f491a8bf1', date: '2027-02-14',
    localTime: '16:00:00', time: '2027-02-14T23:00:00Z', status: 'scheduled', hasBox: false,
    a: wasatch, b: { ...veritas, score: null }, label: 'Veritas Team Host' };
  const previous = { ...saved, id: 'seed2027-veritas-wasatch', opponentSchoolId: 'wasatch-national',
    opponent: 'Wasatch Academy', date: paired.date, venue: 'home' };
  const options = { now };
  const index = parseNikeFixtures(JSON.stringify({ ...fixtures, games: [paired] }));
  const [one] = await collectNike('wasatch-national', [], [previous], index, null, options);
  assert.equal(one.id, previous.id);
  assert.equal(one.schoolId, 'veritas-national');
  assert.equal(one.venue, 'home');
  const duplicate = { ...previous, id: 'new-maxpreps-id' };
  const scanned = await collectNike('veritas-national', [duplicate], [one], index, null, options);
  assert.deepEqual(scanned.map(record => record.id), [one.id]);
  assert.throws(() => normalizeRecord({ ...previous, state: 'post', schoolScore: 51, opponentScore: 49,
    sourceNativeId: 'nike-' + id, sourceUrl: 'https://scholastic.nikeeyb.com/api/current/games/' + id }), /source URL/);
});
