'use strict';
const test=require('node:test'); const assert=require('node:assert/strict');
const {parseCalendar,parseBoxscore,collect}=require('./fsw-collector.cjs');
const seed={id:'official-njcaa-test',uid:'abcdefgh',date:'2026-11-04',opponent:'Albany Technical College',venue:'home'};
const calendar='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:abcdefgh@prestosports.com\r\nDTSTART:20261104T220000Z\r\nSUMMARY:Albany Technical College vs. Florida SouthWestern State College\r\nEND:VEVENT\r\nEND:VCALENDAR';
const row=(name,min='39')=>`<tr><td>${name}</td><td>${min}</td><td>6-20</td><td>2-8</td><td>8-9</td><td>0</td><td>3</td><td>3</td><td>0</td><td>0</td><td>0</td><td>2</td><td>5</td><td>22</td></tr>`;
const box=`<h1>Albany Technical College at Florida SouthWestern State College November 4, 2026</h1><table><tr><td>Final</td><td>1</td><td>2</td><td>T</td></tr><tr><td>Albany Technical College</td><td>44</td><td>59</td><td>103</td></tr><tr><td>Florida SouthWestern State College</td><td>37</td><td>48</td><td>85</td></tr></table><table>${row('Weilun Zhao')}</table>`;
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
test('placeholder minutes are omitted and partial shooting rows are rejected',()=>{
 const placeholder=box.replace(row('Weilun Zhao'),[row('Weilun Zhao','1'),row('Other','1'),row('Third','1'),row('Fourth','1')].join(''));
 assert.equal(parseBoxscore(placeholder,seed).stats.MIN,undefined);
 assert.throws(()=>parseBoxscore(box.replace('6-20','6-2'),seed),/stat/i);
});
test('failed required page aborts collection before publishing a snapshot',async()=>{
 await assert.rejects(collect({seeds:[seed],fetchText:async()=>{throw new Error('HTTP 403')}}),/403/);
});
module.exports={calendar,box,seed};
