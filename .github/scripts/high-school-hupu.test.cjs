'use strict';
const { createHash } = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectMediaResult } = require('./high-school-lib/high-school-media-evidence');
const { parseMediaPage, parseMediaListing } = require('./high-school-media.cjs');

const url = 'https://bbs.hupu.com/644104461.html';
const title = 'EYBL：中国德比！张宇辰3分&杨易轩1板，Bella战胜Veritas';
const content = '<p>虎扑11月21日讯 EYBL：CIA Bella Vista 64-51 Veritas Academy</p>' +
  '<p>本场比赛，中国球员张宇辰（Bella Vista）替补出场11分钟，4投1中，得到3分2助攻1篮板。</p>' +
  '<p>杨易轩（Veritas Academy）首发出场10分钟，3投0中，得到1篮板1抢断。</p>';
const thread = { tid: '644104461', title, url: '/644104461.html', authorId: '56098302', fid: '24',
  status: 0, visibleRange: 'ALL_SEE', createdAt: 1795239311000, content };
const record = { id: 'seed2027-veritas-bella-vista', schoolId: 'veritas-national', opponentSchoolId: 'bella-vista',
  opponent: 'CIA Bella Vista', date: '2026-11-20', localTime: '17:30', timeZone: 'America/Phoenix',
  season: 2027, venue: 'away', state: 'pre' };
const now = new Date('2026-11-21T09:00:00Z');
const html = (fields = {}) => '<script id="__NEXT_DATA__" type="application/json">' +
  JSON.stringify({ props: { pageProps: { detail: { thread: { ...thread, ...fields },
    replies: [{ content: '<p>张宇辰75分</p>' }] } } } }) + '</script>';

test('Hupu listing and first-post evidence match both teams without importing replies', () => {
  assert.deepEqual(parseMediaListing('<li class="bbs-sl-web-post-body"><a href="/644104461.html" class="p-title">张宇辰</a>' +
    '<div class="post-auth"><a href="https://my.hupu.com/27066519444214">虎扑篮球资讯</a></div></li>', ['张宇辰'], 'https://bbs.hupu.com/cba'),
    [{ url, title: '张宇辰' }]);
  const evidence = parseMediaPage(html(), url);
  const result = inspectMediaResult(evidence, [record], now).result;
  assert.ok(result);
  assert.equal(result.schoolScore, 51);
  const byId = Object.fromEntries(result.players.map(player => [player.playerId, player.stats]));
  assert.deepEqual(byId.zhangyuchen, { MIN: '11', PTS: '3', AST: '2', REB: '1', FG: '1-4' });
  assert.deepEqual(byId.yangyixuan, { MIN: '10', REB: '1', STL: '1', FG: '0-3' });
  assert.equal(evidence.bodyHash, createHash('sha256').update(evidence.paragraphs.join('\n')).digest('hex'));
});

test('Hupu rejects unverified authors, mismatched threads and time or team ambiguity', () => {
  assert.equal(parseMediaPage(html({ authorId: 'unknown' }), url), null);
  assert.equal(parseMediaPage(html({ tid: '644104462' }), url), null);
  const evidence = parseMediaPage(html(), url);
  assert.equal(inspectMediaResult(evidence, [{ ...record, localTime: undefined }], now).result, null);
  assert.equal(inspectMediaResult(evidence, [{ ...record, opponent: 'Another School', opponentSchoolId: undefined }], now).result, null);
  assert.equal(inspectMediaResult(evidence, [{ ...record, state: 'post', schoolScore: 51, opponentScore: 64,
    players: [{ playerId: 'zhangyuchen', stats: { MIN: '10:30' } }] }], now).result, null);
});

test('Hupu tight Wasatch headline provides named stats without inventing minutes', () => {
  const evidence = parseMediaPage(html({ title: 'EYBL：张懿赵杰全场27中10，得到24分', content:
    '<p>虎扑11月21日讯 EYBL联赛：Wasatch Academy58-64Faith Family。</p>' +
    '<p>本场比赛，中国球员张懿赵杰 全场27中10， 得到24分4助攻3篮板2抢断。</p>' }), url);
  const wasatch = { ...record, schoolId: 'wasatch-national', id: 'seed2027-wasatch-faith-family',
    localTime: '19:00', timeZone: 'America/Chicago', opponent: 'Faith Family', opponentSchoolId: undefined };
  const result = inspectMediaResult(evidence, [wasatch], now).result;
  assert.equal(result.schoolScore, 58);
  assert.deepEqual(result.players[0].stats, { PTS: '24', FG: '10-27', AST: '4', REB: '3', STL: '2' });
});

test('Hupu primary result rejects any unsupported fields or DNP', () => {
  const { normalizeRecord } = require('./high-school-lib/high-school-records');
  const evidence = { ...parseMediaPage(html(), url), sourceUrl: 'https://bbs.hupu.com/644109999.html' };
  const result = inspectMediaResult(evidence, [record], now).result;
  assert.doesNotThrow(() => normalizeRecord(result));
  const [first, second] = result.players;
  assert.throws(() => normalizeRecord({ ...result, players: [{ ...first, stats: { ...first.stats, BLK: 8 } }, second] }), /provenance/);
  assert.throws(() => normalizeRecord({ ...result, players: [first, { playerId: second.playerId, dnp: true, reason: 'fake' }] }), /provenance/);
});
