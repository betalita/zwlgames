'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

test('Actions gate skips idle postgame runs without publishing or changing files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'fsw-gate-'));
  try {
    const script = path.join(__dirname, 'fsw-collection-gate.cjs');
    const output = path.join(root, 'outputs');
    const run = mode => execFileSync(process.execPath, [script], { cwd: root,
      env: { ...process.env, FSW_COLLECT_MODE: mode, GITHUB_OUTPUT: output }, encoding: 'utf8' });
    run('postgame');
    assert.equal(await fs.readFile(output, 'utf8'), 'collect=false\n');
    await fs.mkdir(path.join(root, 'data'));
    const index = JSON.stringify({ games: [
      { id: 'old', timeKnown: true, startsAt: '2026-01-01T00:00:00Z' },
      { id: 'tba', timeKnown: false, startsAt: new Date(Date.now() - 3 * 3600000).toISOString() },
    ] });
    await fs.writeFile(path.join(root, 'data/fsw-2026-27.json'), index);
    await fs.writeFile(output, '');
    run('postgame');
    assert.equal(await fs.readFile(output, 'utf8'), 'collect=false\n');
    assert.equal(await fs.readFile(path.join(root, 'data/fsw-2026-27.json'), 'utf8'), index);
    await fs.writeFile(path.join(root, 'data/fsw-2026-27.json'), JSON.stringify({ games: [
      { id: 'due', timeKnown: true, startsAt: new Date(Date.now() - 3 * 3600000).toISOString() },
    ] }));
    await fs.writeFile(output, '');
    run('postgame');
    assert.equal(await fs.readFile(output, 'utf8'), 'collect=true\n');
    await fs.rm(path.join(root, 'data'), { recursive: true });
    await fs.writeFile(output, '');
    run('full');
    assert.equal(await fs.readFile(output, 'utf8'), 'collect=true\n');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
