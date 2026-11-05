'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { buildPublication, postgameCandidates, writePublication } = require('./fsw-publication.cjs');
const game = { id: 'official-njcaa-albany', uid: 'pe7l', sourceDate: '2026-11-04',
  startsAt: '2026-11-04T22:00:00.000Z', timeKnown: true,
  opponent: 'Albany Technical College', venue: 'home', result: {
    schoolScore: 85, opponentScore: 103, schoolPeriods: [37,48], opponentPeriods: [44,59],
    sourceUrl: 'https://www.fswbucs.com/sports/mbkb/2026-27/boxscores/20261104_pe7l.xml',
    stats: { PTS: '22' }, details: { school: { groups: [], statistics: [] } },
  } };
const snapshot = () => ({ schemaVersion: 1, season: 2027, school: 'official-fsw',
  generatedAt: '2026-11-05T02:00:00.000Z', sourceUrl: 'https://www.fswbucs.com/sports/mbkb/2026-27/schedule',
  games: [structuredClone(game), { ...game, id: 'official-njcaa-future', result: null }] });
test('publication separates a small index from a hashed single-game file', () => {
  const p = buildPublication(snapshot());
  assert.equal(p.index.schemaVersion, 2);
  assert.deepEqual(p.index.games[0].result, { schoolScore: 85, opponentScore: 103 });
  assert.equal(p.index.games[0].result.details, undefined);
  const ref = p.index.games[0].detail;
  assert.equal(ref.path, 'data/fsw-2026-27/games/official-njcaa-albany.json');
  const text = p.files.get(ref.path);
  assert.equal(createHash('sha256').update(text).digest('hex'), ref.sha256);
  assert.equal(JSON.parse(text).game.result.stats.PTS, '22');
  assert.equal(p.index.games[1].detail, null);
  assert.equal(p.files.size, 1);
});
test('unchanged detail content has a stable hash across collection times', () => {
  const s = snapshot(), first = buildPublication(s);
  s.generatedAt = '2026-11-05T03:00:00.000Z';
  assert.equal(buildPublication(s).index.games[0].detail.sha256, first.index.games[0].detail.sha256);
});
test('targeted updates preserve other games and a temporarily unavailable final', () => {
  const first = buildPublication(snapshot()).index;
  const partial = { ...snapshot(), games: [{ ...game, result: null, collectionError: 'HTTP 403' }] };
  const next = buildPublication(partial, first);
  assert.deepEqual(next.index.games[0], first.games[0]);
  assert.equal(next.index.games.length, 2);
  assert.equal(next.files.size, 0);
});
test('postgame collection is limited to known tipoffs between two and six hours ago', () => {
  const index = { games: [game, { ...game, id: 'tba', timeKnown: false, startsAt: null }] };
  assert.deepEqual(postgameCandidates(index, new Date('2026-11-04T23:59:00Z')), []);
  assert.deepEqual(postgameCandidates(index, new Date('2026-11-05T00:00:00Z')), [game.id]);
  assert.deepEqual(postgameCandidates(index, new Date('2026-11-05T03:59:00Z')), [game.id]);
  assert.deepEqual(postgameCandidates(index, new Date('2026-11-05T04:00:00Z')), []);
});
test('publication writes the index and its exact referenced details to a standalone checkout', async () => {
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'fsw-publication-'));
  try {
    await writePublication(buildPublication(snapshot()),root);
    const index=JSON.parse(await fs.readFile(path.join(root,'data/fsw-2026-27.json'),'utf8'));
    const text=await fs.readFile(path.join(root,index.games[0].detail.path),'utf8');
    assert.equal(JSON.parse(text).game.result.opponentScore,103);
    assert.equal(createHash('sha256').update(text).digest('hex'),index.games[0].detail.sha256);
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
