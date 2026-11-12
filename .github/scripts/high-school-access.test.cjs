'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectSource } = require('./high-school-access.cjs');
const target = { kind: 'maxpreps', school: 'Providence Christian Academy', year: '26-27' };
const page = data => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({props:{pageProps:data}})}</script>`;
const data = { teamContext: { data: { schoolName: 'Providence Christian Academy', year: '26-27', gender: 'Boys', sport: 'Basketball', level: 'Varsity' } }, contests: [] };
test('HTTP success without the requested team, season and schedule payload is rejected', () => {
  assert.equal(inspectSource(target, 200, page(data)).readable, true);
  assert.equal(inspectSource(target, 403, page(data)).readable, false);
  assert.equal(inspectSource(target, 200, '<html>Just a moment cf-chl-</html>').readable, false);
  assert.equal(inspectSource(target, 200, page({...data, teamContext:{data:{...data.teamContext.data,year:'25-26'}}})).readable, false);
  assert.equal(inspectSource(target, 200, page({...data, teamContext:{data:{...data.teamContext.data,gender:'Girls'}}})).readable, false);
});
test('an accessible statistics page without current statistics reports the gap', () => {
  assert.deepEqual(inspectSource({kind:'eybl'},200,"2026-2027 Men's Basketball Sorry, no statistics available."),
    {readable:true, currentStats:false, reason:'current season statistics not published'});
  assert.equal(inspectSource({kind:'legit'},200,'Wasatch Academy box score MIN PTS REB AST FG').readable,true);
  assert.equal(inspectSource({kind:'legit'},200,'Log in').readable,false);
});
