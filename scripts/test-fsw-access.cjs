'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { setTimeout: pause } = require('node:timers/promises');

const BASE = 'https://www.fswbucs.com/sports/mbkb/2026-27';
const TARGETS = [
  ['schedule', 'schedule', `${BASE}/schedule`],
  ['calendar', 'calendar', `${BASE}/schedule?print=ical`],
  ['hill', 'boxscore', `${BASE}/boxscores/20261030_yigc.xml`],
  ['mclennan', 'boxscore', `${BASE}/boxscores/20261031_cub1.xml`],
  ['albany', 'boxscore', `${BASE}/boxscores/20261104_pe7l.xml`],
];
const AGENTS = {
  script: 'cnhoops-access-test/1.0',
  browser: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

function inspectResponse(kind, status, body) {
  const challenged = /cf-chl-|just a moment|verify you are human|captcha|access denied|request blocked/i.test(body);
  const expected = kind === 'calendar'
    ? /BEGIN:VCALENDAR/.test(body) && /BEGIN:VEVENT/.test(body) && /DTSTART/.test(body)
    : kind === 'boxscore'
      ? /Florida SouthWestern/i.test(body) && /Weilun\s+Zhao/i.test(body) && /Final/i.test(body)
      : /Florida SouthWestern/i.test(body) && /2026-27/.test(body) && /schedule/i.test(body);
  const ok = status === 200 && !challenged && expected;
  return { ok, challenged, expectedContent: expected,
    reason: status !== 200 ? `HTTP ${status}` : challenged ? 'Possible access challenge'
      : !expected ? 'Expected page content missing' : 'Expected content found' };
}

async function run() {
  const directory = path.resolve('fsw-access-report');
  await fs.mkdir(directory, { recursive: true });
  const results = [];
  for (const [name, kind, url] of TARGETS) {
    for (const [agent, userAgent] of Object.entries(AGENTS)) {
      const start = Date.now();
      const row = { name, kind, agent, url, checkedAt: new Date().toISOString() };
      try {
        // One bounded request per variant; no retries, credentials, cookies or bypass services.
        const response = await fetch(url, {
          headers: { 'User-Agent': userAgent, Accept: '*/*', 'Accept-Language': 'en-US,en;q=0.9' },
          signal: AbortSignal.timeout(25000),
        });
        const body = await response.text();
        Object.assign(row, { status: response.status, finalUrl: response.url,
          contentType: response.headers.get('content-type'), bytes: Buffer.byteLength(body),
          ...inspectResponse(kind, response.status, body) });
        const headers = Object.fromEntries(['content-type', 'server', 'location', 'cf-ray', 'cache-control']
          .map(key => [key, response.headers.get(key)]).filter(([, value]) => value !== null));
        await fs.writeFile(path.join(directory, `${name}-${agent}.body.txt`), body);
        await fs.writeFile(path.join(directory, `${name}-${agent}.headers.json`), JSON.stringify(headers, null, 2));
      } catch (error) {
        Object.assign(row, { ok: false, status: null, reason: error.message,
          errorCode: error.cause?.code || error.code || error.name });
      }
      row.elapsedMs = Date.now() - start;
      results.push(row);
      console.log(`${name}/${agent}: ${row.status ?? 'NETWORK_ERROR'}; ${row.reason}; ${row.elapsedMs} ms`);
      await pause(1000);
    }
  }
  // A target is usable when at least one variant succeeds; retain variant failures for diagnosis.
  const accessible = TARGETS.filter(([name]) => results.some(row => row.name === name && row.ok)).length;
  const report = { checkedAt: new Date().toISOString(), runner: {
    name: process.env.RUNNER_NAME || 'local', os: process.env.RUNNER_OS || process.platform,
    environment: process.env.RUNNER_ENVIRONMENT || 'local',
    note: 'Runner location is not verified. Successful access does not prove a US IP or future availability.',
  }, accessibleTargets: accessible, totalTargets: TARGETS.length, results };
  await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const summary = [
    '# FSW 官网访问测试', '',
    `可读取地址：${accessible}/${TARGETS.length}。同一地址任一 User-Agent 成功即计为可读取。`, '',
    '| 地址 | User-Agent | HTTP | 内容校验 | 耗时 ms |',
    '|---|---|---|---|---|',
    ...results.map(row => `| ${row.name} | ${row.agent} | ${row.status ?? '网络错误'} | ${row.ok ? '通过' : '未通过'} | ${row.elapsedMs} |`),
    '', '完整报告及响应正文见 fsw-access-report 附件。',
    '此测试不验证出口国家、不执行 JavaScript、不解决访问挑战，也不更新生产数据。', '',
  ].join('\n');
  await fs.writeFile(path.join(directory, 'summary.md'), summary);
  if (process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
  if (accessible !== TARGETS.length) process.exitCode = 1;
}

module.exports = { inspectResponse };
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
