'use strict';
const fs = require('node:fs/promises');
const { postgameCandidates, INDEX_PATH } = require('./fsw-publication.cjs');

async function main() {
  let due = true;
  if (process.env.FSW_COLLECT_MODE === 'postgame') {
    let index = null;
    try { index = JSON.parse(await fs.readFile(INDEX_PATH, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    due = postgameCandidates(index).length > 0;
  }
  if (process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT, `collect=${due}\n`);
  console.log(due ? 'FSW collection is due' : 'No FSW games in postgame window; skipping collection steps');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
