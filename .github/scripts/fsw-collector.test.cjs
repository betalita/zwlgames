'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const {parseCalendar,parseBoxscore,collect,serializeSnapshot}=require('./fsw-collector.cjs');
const seed={id:'official-njcaa-test',uid:'abcdefgh',date:'2026-11-04',opponent:'Albany Technical College',venue:'home'};
const calendar='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abcdefgh@prestosports.com\r\nDTSTART:20261104T220000Z\r\nSUMMARY:Albany Technical College vs. Florida SouthWestern State College\r\nEND:VEVENT\r\nEND:VCALENDAR';
const f=require('./fixtures/fsw-albany.cjs');
const score='<table><tr><td>Final</td><td>1</td><td>2</td><td>T</td></tr><tr><td>Albany Technical College</td><td>44</td><td>59</td><td>103</td></tr><tr><td>Florida SouthWestern State College</td><td>37</td><td>48</td><td>85</td></tr></table>';
const box=f.heading+score+f.html()+'<a id="teamstats-tab" href="?view=teamstats">Team Stats</a>';
const aveHtml=require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/fsw-ave-maria.html'),'utf8');
const aveSeed={opponent:'Ave Maria JV'};
test('Ave Maria final uses full-game rosters when the page also includes both half box scores',()=>{
 const result=parseBoxscore(aveHtml,aveSeed);
 assert.equal(result.schoolScore,124);assert.equal(result.opponentScore,79);
 assert.deepEqual(result.schoolPeriods,[63,61]);assert.deepEqual(result.opponentPeriods,[36,43]);
 assert.equal(result.stats?.MIN,'13');assert.equal(result.stats?.PTS,'13');
 assert.equal(result.stats?.FG,'5-6');assert.equal(result.stats?.['3PT'],'3-4');
 assert.equal(result.stats?.REB,'4');assert.equal(result.stats?.AST,'2');
 assert.equal(result.details.school.groups.flatMap(g=>g.athletes).length,13);
 assert.equal(result.details.opponent.groups.flatMap(g=>g.athletes).length,9);
});
test('a preceding site heading does not hide the verified match heading or allow a foreign opponent',()=>{
 const html='<h1>Men\'s Basketball</h1>'+aveHtml;
 assert.equal(parseBoxscore(html,aveSeed).stats?.PTS,'13');
 assert.throws(()=>parseBoxscore(html,{opponent:'Another JV'}),/identity mismatch/);
});
test('calendar binds stable UID and preserves explicit TBA',()=>{
 assert.equal(parseCalendar(calendar).get('abcdefgh').startsAt,'2026-11-04T22:00:00.000Z');
 assert.equal(parseCalendar(calendar.replace('DTSTART:20261104T220000Z','DTSTART;VALUE=DATE:20261104')).get('abcdefgh').startsAt,null);
 assert.throws(()=>parseCalendar('Access denied'),/calendar/i);
});
test('final box score verifies school, opponent and Zhao and captures statistics',()=>{
 const result=parseBoxscore(box,seed); assert.equal(result.schoolScore,85);assert.equal(result.opponentScore,103);
 assert.equal(result.stats.MIN,'39');assert.equal(result.stats.PTS,'22');
 assert.throws(()=>parseBoxscore(box.replaceAll('Albany Technical','Another'),seed),/identity/i);
 assert.equal(parseBoxscore(box.replace('Final','Scheduled'),seed),null);
 assert.equal(parseBoxscore(box.replace('Weilun Zhao','Other Player'),seed).stats,null);
});
test('placeholder minutes and invalid shooting cells are omitted',()=>{
 const school=f.school.map(r=>r.length===14&&/^\d+ /.test(r[0])?[r[0],'1',...r.slice(2)]:r);
 const placeholder=f.heading+score+f.table('Florida SouthWestern State College',[f.labels,...school]);
 assert.equal(parseBoxscore(placeholder,seed).stats.MIN,undefined);
 assert.equal(parseBoxscore(box.replace('6-20','6-2'),seed).stats.FG,undefined);
});
test('failed required page aborts collection before publishing a snapshot',async()=>{
 await assert.rejects(collect({seeds:[seed],fetchText:async()=>{throw new Error('HTTP 403')}}),/403/);
});
test('snapshot output stays compact and rejects an oversized UTF-8 payload before publication',()=>{
 const snapshot={games:[{result:{details:require('./fsw-details.cjs').parseDetails(f.html(),seed,{schoolScore:85,opponentScore:103})}}]};
 const text=serializeSnapshot(snapshot);assert.deepEqual(JSON.parse(text),snapshot);
 assert.ok(Buffer.byteLength(text)<10000);
 assert.throws(()=>serializeSnapshot({value:'球'.repeat(180000)}),/size limit/i);
});
module.exports={calendar,box,seed};
const pascoSeed=require('./fsw-games.json').find(g=>g.date==='2026-11-07');
const pascoSchedule=require('node:fs').readFileSync(require('node:path').join(__dirname,'fixtures/fsw-pasco-schedule.html'),'utf8');
const pascoCalendar=calendar.replaceAll(seed.uid,pascoSeed.uid).replaceAll('20261104','20261107')
 .replaceAll(seed.opponent,pascoSeed.opponent);
async function collectPasco(schedule=pascoSchedule){
 return (await collect({seeds:[pascoSeed],clock:()=>new Date('2026-11-08T00:00:00Z'),
  fetchText:async url=>url.includes('print=ical')?pascoCalendar:url.endsWith('/schedule')?schedule:box})).games[0];
}
test('official schedule Final supplies a score without inventing periods or player statistics',async()=>{
 const game=await collectPasco();
 assert.deepEqual(game.result,{schoolScore:99,opponentScore:76,schoolPeriods:[],opponentPeriods:[],
  stats:null,sourceType:'schedule',sourceUrl:'https://www.fswbucs.com/sports/mbkb/2026-27/schedule?eid='+pascoSeed.uid});
});
test('schedule fallback requires the exact event, opponent, Final and consistent win/loss',async()=>{
 for(const html of [pascoSchedule.replaceAll(pascoSeed.uid,'other-event'),
  pascoSchedule.replaceAll(pascoSeed.opponent,'Other College'),pascoSchedule.replace('Final','In Progress'),
  pascoSchedule.replace('99-76','70-76'),pascoSchedule.replace('99-76','999-76'),
  pascoSchedule+pascoSchedule]){
  assert.equal((await collectPasco(html)).result,null);
 }
 const loss=await collectPasco(pascoSchedule.replace('data-context="result">W','data-context="result">L').replace('99-76','70-76'));
 assert.equal(loss.result.schoolScore,70);
});
test('a failed or unpublished boxscore keeps the verified schedule score',async()=>{
 const html=pascoSchedule.replace('data-recap=', 'data-boxscore="/sports/mbkb/2026-27/boxscores/20261107_90ik.xml" data-recap=')
  +'<a href="/sports/mbkb/2026-27/boxscores/20261107_90ik.xml">Box Score</a>';
 const game=await collectPasco(html);
 assert.equal(game.result?.schoolScore,99);
 assert.equal(game.result?.stats,null);
});
test('collection includes verified full details and tolerates unavailable optional team comparison',async()=>{
 const f=require('./fixtures/fsw-albany.cjs');const reads=[];
 const get=async url=>{reads.push(url);if(url.includes('print=ical'))return calendar;
  if(url.endsWith('/schedule'))return 'Florida SouthWestern 2026-27 <a href="/sports/mbkb/2026-27/boxscores/20261104_abcd.xml">Box Score</a>';
  if(url.includes('view=teamstats'))throw Error('HTTP 403');return box;};
 const data=await collect({seeds:[seed],fetchText:get,clock:()=>new Date('2026-11-05T14:00:00Z')});
 assert.ok(data.games[0].result.details.school.groups.length);
 assert.ok(reads.some(x=>x.endsWith('?view=teamstats')));
});
