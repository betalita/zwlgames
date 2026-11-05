'use strict';
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const INDEX_PATH = 'data/fsw-2026-27.json';
const DETAIL_DIR = 'data/fsw-2026-27/games';

function serializeSnapshot(value) {
  const text = JSON.stringify(value) + '\n';
  if (Buffer.byteLength(text, 'utf8') > 512 * 1024) throw new Error('FSW snapshot size limit exceeded; keeping previous snapshot');
  return text;
}

function buildPublication(snapshot, previousIndex = null) {
  const previous = new Map((previousIndex?.games || []).map(game => [game.id, game]));
  const incoming = new Map(snapshot.games.map(game => [game.id, game]));
  const order = [...previous.keys(), ...incoming.keys()].filter((id, i, all) => all.indexOf(id) === i);
  const files = new Map();
  const games = order.map(id => {
    const old = previous.get(id);
    let game = incoming.get(id) || old;
    if (!/^[a-z0-9-]{1,100}$/.test(id)) throw new Error('invalid FSW game file identity');
    // A temporarily unavailable or incomplete page cannot downgrade an earlier final.
    if (!game.result && old?.result && old.opponent === game.opponent && old.venue === game.venue) game = old;
    if (!game.result || game.detail) {
      const { collectionError, ...entry } = game;
      return { ...entry, detail: game.detail || null };
    }
    const { collectionError, ...detailGame } = game;
    const text = serializeSnapshot({ schemaVersion: 2, kind: 'game', season: 2027,
      school: 'official-fsw', game: detailGame });
    const file = `${DETAIL_DIR}/${id}.json`;
    files.set(file, text);
    return { ...detailGame, result: { schoolScore: game.result.schoolScore, opponentScore: game.result.opponentScore },
      detail: { path: file, sha256: createHash('sha256').update(text).digest('hex') } };
  });
  const index = { schemaVersion: 2, kind: 'schedule', season: 2027, school: 'official-fsw',
    sourceUrl: snapshot.sourceUrl, generatedAt: snapshot.generatedAt, games };
  serializeSnapshot(index); // Validate all output sizes before touching published files.
  return { index, files };
}

async function writePublication(publication, root = process.cwd()) {
  const indexText = serializeSnapshot(publication.index);
  for (const [relative, text] of [...publication.files, [INDEX_PATH, indexText]]) {
    const destination = path.resolve(root, relative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination + '.tmp', text);
    await fs.rename(destination + '.tmp', destination);
  }
}

function postgameCandidates(index, now = new Date()) {
  return (index?.games || []).filter(game => {
    if (!game.timeKnown || !game.startsAt) return false;
    const elapsed = now.getTime() - Date.parse(game.startsAt);
    return elapsed >= 2 * 3600000 && elapsed < 6 * 3600000;
  }).map(game => game.id);
}

module.exports = { buildPublication, writePublication, postgameCandidates, serializeSnapshot, INDEX_PATH };
