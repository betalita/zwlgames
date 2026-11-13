'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {parseMaxPreps,parseLegitBox,mergeSchedules}=require('./high-school-lib/high-school-external');
const {HIGH_SCHOOL_PLAYERS,SCHOOLS}=require('./high-school-lib/high-school-roster');
test('Ziyi Zhang uses the independently confirmed New York prep squad, not the California namesake',()=>{
 const player=HIGH_SCHOOL_PLAYERS.find(p=>p.id==='zhangziyi');
 assert.equal(SCHOOLS[player.schoolId].timeZone,'America/New_York');
 assert.equal(new URL(SCHOOLS[player.schoolId].url).hostname,'www.notredamehighschool.com');
 assert.equal(SCHOOLS[player.schoolId].adapter,undefined);
});
const context={schoolName:'Providence Christian Academy',year:'26-27',gender:'Boys',sport:'Basketball',level:'Varsity'};
const url='https://www.maxpreps.com/tn/murfreesboro/providence-christian-academy-lions/basketball/schedule/';
const mp=(team=context)=>`<script id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{teamContext:{data:team},contests:[]}}})}</script><table><thead><tr><th>Date/Time</th><th>Opponent</th></tr></thead><tbody>
<tr><td><a href="/tn/basketball/game/example/11-17-2026/?c=7103774a-0aed-43c0-bb4a-c5e0464f22ff">11/17 7:00pm</a></td><td><span class="hat">@</span><span class="name">Montgomery Bell Academy</span></td><td></td><td></td><td>Preview Game</td></tr>
<tr><td>12/28 TBA</td><td>vs TBA (Tournament)</td></tr></tbody></table>`;
test('MaxPreps validates boys varsity identity and omits unknown opponents and unverified tipoff timezone',()=>{
 const rows=parseMaxPreps('providence-tn-varsity',mp(),url);
 assert.equal(rows.length,1);assert.equal(rows[0].date,'2026-11-17');assert.equal(rows[0].opponent,'Montgomery Bell Academy');
 assert.equal(rows[0].venue,'away');assert.equal(rows[0].state,'pre');assert.equal(rows[0].localTime,undefined);
 assert.throws(()=>parseMaxPreps('providence-tn-varsity',mp({...context,year:'25-26'}),url),/identity|season/);
 assert.throws(()=>parseMaxPreps('providence-tn-varsity',mp({...context,gender:'Girls'}),url),/identity/);
 assert.throws(()=>parseMaxPreps('link-hs-elite',mp({...context,schoolName:'Link Academy'}),url),/school|mapping/);
});
test('a supplemental schedule preserves a verified official identity and time',()=>{
 const official={...parseMaxPreps('providence-tn-varsity',mp(),url)[0],id:'official-pca-mba',localTime:'19:00',sourceUrl:'https://providencechristian.com/calendar/athletics-calendar-list/'};
 const extra=parseMaxPreps('providence-tn-varsity',mp(),url)[0];
 const merged=mergeSchedules([official],[extra]);assert.equal(merged.length,1);assert.equal(merged[0].id,'official-pca-mba');assert.equal(merged[0].localTime,'19:00');
 assert.throws(()=>mergeSchedules([official],[{...extra,opponent:'Wrong Team'}]),/conflict/);
});
test('a MaxPreps cancellation propagates with the original game ID',()=>{
 const original=parseMaxPreps('providence-tn-varsity',mp(),url);
 const cancelled=parseMaxPreps('providence-tn-varsity',mp().replace('Preview Game','Cancelled'),url);
 assert.equal(cancelled[0]?.id,'mp-7103774a-0aed-43c0-bb4a-c5e0464f22ff');
 assert.equal(cancelled[0]?.scheduleStatus,'cancelled');
 assert.equal(mergeSchedules(original,cancelled)[0].scheduleStatus,'cancelled');
});
test('reported identity conflicts preserve official rows without blocking unrelated supplements',()=>{
 const official=parseMaxPreps('providence-tn-varsity',mp(),url)[0];
 const conflicts=[];
 const extra={...official,id:'next-game',date:'2026-11-20',opponent:'Baylor'};
 const rows=mergeSchedules([official],[{...official,opponent:'MBA'},extra],{onConflict:message=>conflicts.push(message)});
 assert.deepEqual(rows,[official,extra]);assert.equal(conflicts.length,1);assert.match(conflicts[0],/2026-11-17.*Montgomery Bell Academy.*MBA/);
 assert.throws(()=>mergeSchedules([{...official,state:'post',schoolScore:70,opponentScore:60}],
  [{...official,state:'post',schoolScore:71,opponentScore:60}],{onConflict:()=>{}}),/score conflict/);
});
const game={id:'wasatch-test',schoolId:'wasatch-national',season:2027,date:'2026-11-10',opponent:'Utah Prep',venue:'unknown',state:'pre',sourceUrl:'https://www.basketball.wasatchacademy.org/schedule'};
const box=(year=2026,points=12)=>`<h1>Wasatch Academy 12, Utah Prep 10</h1><p>Tuesday, November 10, ${year} · Nike EYBL Scholastic</p>
<h2>Wasatch Academy — 12</h2><table><thead><tr>${['Player','MIN','PTS','REB','AST','STL','BLK','TO','PF','FG','3PT','FT'].map(x=>'<th>'+x+'</th>').join('')}</tr></thead><tbody>
<tr>${['#13 Jay Zhang','20',points,'3','2','0','0','1','2','4-8','2-4','2-2'].map(x=>'<td>'+x+'</td>').join('')}</tr>
<tr>${['Team totals','-','12','3','2','0','0','1','2','4-8','2-4','2-2'].map(x=>'<td>'+x+'</td>').join('')}</tr></tbody></table>
<h2>Utah Prep — 10</h2><table><tr><th>Player</th><th>PTS</th></tr><tr><td>Other Player</td><td>10</td></tr><tr><td>Team totals</td><td>10</td></tr></table>`;
test('LegitGM accepts only the current matchup and an exact tracked-player row with consistent totals',()=>{
 const result=parseLegitBox(box(),game,'https://legitgm.com/stats/game/abc/print');
 assert.equal(result.state,'post');assert.equal(result.players[0].playerId,'zhangyizhaojie');assert.equal(result.players[0].stats.PTS,'12');
 assert.throws(()=>parseLegitBox(box(2025),game,'https://legitgm.com/stats/game/abc/print'),/date|season/);
 assert.throws(()=>parseLegitBox(box(2026,11),game,'https://legitgm.com/stats/game/abc/print'),/total|shooting/);
 const missing=parseLegitBox(box().replace('Jay Zhang','Unrelated Zhang'),game,'https://legitgm.com/stats/game/abc/print');
 assert.deepEqual(missing.players,[]);
});


test('Peddie hosted doubleheaders exclude other schools and identify its own opponent',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const html=fs.readFileSync(path.join(__dirname,'fixtures/peddie-hosted-tournament.html'),'utf8');
 const games=require('./high-school-lib/high-school-sources').parseSchoolSchedule('peddie-varsity',html);
 assert.equal(games.length,2);
 assert.equal(games[0].id,'peddie-47025');assert.equal(games[0].opponent,'The Kiski School (PA)');
 assert.equal(games[1].id,'peddie-47051');assert.equal(games[1].venue,'away');
});
