'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {publishSchool,collect,publishSnapshot}=require('./high-school-collector.cjs');
const now=new Date('2026-11-12T10:00:00Z');
const game={id:'example',schoolId:'providence-tn-varsity',season:2027,date:'2026-11-17',opponent:'Montgomery Bell Academy',venue:'away',state:'pre',sourceUrl:'https://providencechristian.com/calendar/athletics-calendar-list/'};
// Public school iCalendar event, checked 2026-11-13. The date is UTC,
// not the Arizona source date; the folded UID must survive a feed fallback.
const calendar=`BEGIN:VCALENDAR
VERSION:2.0
X-WR-TIMEZONE:America/Phoenix
BEGIN:VEVENT
DTSTART:20261113T020000Z
DTEND:20261113T033000Z
SUMMARY:EYBL vs ESA
UID:'cba440a4501a277e8c272618817c6a4ebbb119d69256866696a66eab64e939ec@group
 .calendar.google.com|07lv8qfl25l68g81r50fh5qefu'_20261113
END:VEVENT
BEGIN:VEVENT
DTSTART:20261103T020000Z
SUMMARY:BV National vs Canyon National
UID:other-squad@google.com
END:VEVENT
END:VCALENDAR`;
test('Bella Vista discovers the missing Nov 13 China game from its school calendar, excluding other squads',async()=>{
 const result=await collect({now,fetchText:async url=>{
  if(url.includes('bellavistacollegeprep.com')&&url.includes('events_ical.cfm'))return calendar;
  throw new Error('unavailable');
 }});
 const entry=result.schools.find(s=>s.schoolId==='bella-vista');
 assert.ok(entry,'official calendar must discover games without an existing known matchup');
 const row=entry.games.find(g=>g.opponent==='Elite Sports Academy');
 assert.ok(row);assert.equal(row.date,'2026-11-12');assert.equal(row.localTime,'19:00');
 assert.equal(row.timeZone,'America/Phoenix');assert.equal(row.state,'pre');assert.equal(row.bootstrap,undefined);
 assert.equal(entry.games.filter(g=>g.schoolId==='bella-vista').length,1);
 assert.ok(entry.games.some(g=>g.opponentSchoolId==='bella-vista'),'retain the reviewed Veritas matchup');
 const {normalizeRecord}=require('./high-school-lib/high-school-records');
 const normalized=normalizeRecord(row);
 assert.equal(normalized.startsAt,'2026-11-13 02:00:00');assert.equal(normalized.dateKey,'2026-11-13');
 assert.equal(normalized.players[0].playerId,'zhangyuchen');assert.equal(normalized.players[0].stats,null);
});
test('Bella Vista falls back to the public Google calendar using the same stable event identity',async()=>{
 const school=await collect({now,fetchText:async url=>{
  if(url.includes('events_ical.cfm'))return calendar;throw new Error('unavailable');
 }});
 const fallback=await collect({now,fetchText:async url=>{
  if(url.startsWith('https://calendar.google.com/calendar/ical/'))return calendar.replace(/UID:[\s\S]*?END:VEVENT/,
   'UID:07lv8qfl25l68g81r50fh5qefu@google.com\nEND:VEVENT');
  throw new Error('unavailable');
 }});
 const row=s=>s.schools.find(e=>e.schoolId==='bella-vista')?.games.find(g=>g.opponent==='Elite Sports Academy');
 assert.ok(row(fallback));assert.equal(row(fallback).id,row(school).id);
});
test('Bella Vista source outage retains the last successful calendar and its original freshness',async()=>{
 const previous=await collect({now,fetchText:async url=>{
  if(url.includes('events_ical.cfm'))return calendar;throw new Error('unavailable');
 }});
 const later=new Date('2026-11-13T04:00:00Z');
 const result=await collect({now:later,previous,fetchText:async url=>{
  // Reachable old seed page must not mask failed dynamic sources.
  if(url==='https://veritasbasketball.com/schedule')return '2026-27';throw new Error('HTTP 503');
 }});
 const row=result.schools.find(e=>e.schoolId==='bella-vista');assert.ok(row);
 assert.equal(row.fetchedAt,now.toISOString());assert.ok(row.games.some(g=>g.opponent==='Elite Sports Academy'));
});
test('failed collection preserves last successful freshness, and expired entries are not republished',()=>{
 const old={schoolId:'providence-tn-varsity',fetchedAt:'2026-11-11T10:00:00.000Z',games:[game]};
 assert.equal(publishSchool(old,null,now).fetchedAt,'2026-11-11T10:00:00.000Z');
 assert.equal(publishSchool({...old,fetchedAt:'2026-11-01T10:00:00.000Z'},null,now),null);
});
test('a new schedule preserves a confirmed final and player statistics',()=>{
 const final={...game,date:'2026-11-10',state:'post',schoolScore:70,opponentScore:60,players:[{playerId:'liuzhenhe',stats:{PTS:12}}]};
 const previous={schoolId:'providence-tn-varsity',fetchedAt:'2026-11-11T10:00:00.000Z',games:[final]};
 const current={schoolId:'providence-tn-varsity',games:[{...final,state:'pre',players:undefined,schoolScore:undefined,opponentScore:undefined}]};
 assert.equal(publishSchool(previous,current,now).games[0].state,'post');
 assert.equal(publishSchool(previous,current,now).games[0].players[0].stats.PTS,12);
});
test('a partial statistics update preserves earlier fields and omitted tracked players',()=>{
 const final={...game,date:'2026-11-10',state:'post',schoolScore:70,opponentScore:60,players:[{playerId:'liuzhenhe',stats:{PTS:12,REB:8,AST:2}}]};
 const previous={schoolId:'providence-tn-varsity',fetchedAt:'2026-11-11T10:00:00.000Z',games:[final]};
 const current={schoolId:'providence-tn-varsity',games:[{...final,players:[{playerId:'liuzhenhe',stats:{PTS:12}}]}]};
 assert.deepEqual(publishSchool(previous,current,now).games[0].players[0].stats,{PTS:12,REB:8,AST:2});
 current.games[0].players=[{playerId:'liuzhenhe',dnp:true,reason:'explicit source DNP'}];
 assert.throws(()=>publishSchool(previous,current,now),/DNP.*conflict/);
});
test('an outage creates an explicit failed source report without inventing a fresh schedule',async()=>{
 const result=await collect({now,previous:null,fetchText:async()=>{throw new Error('HTTP 403');}});
 assert.equal(result.schools.length,0);assert.ok(result.sources.some(r=>r.status==='error'&&r.message.includes('403')));
});
test('reachable seed source does not rewrite its original verification date',async()=>{
 const result=await collect({now,fetchText:async url=>{
  if(url.includes('wasatchacademy.org'))return '<a href="/s/2026-27-Schedule.pdf">2026-27</a>';
  throw new Error('unavailable');
 }});
 const entry=result.schools.find(s=>s.schoolId==='wasatch-national');
 assert.equal(entry.mode,'verified-seed');assert.equal(entry.fetchedAt,'2026-11-11T00:00:00.000Z');
 assert.ok(entry.games.every(g=>g.bootstrap));
});
test('publication fails without a fresh automatic school and leaves the old file unchanged',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'high-school-publication-')),file=path.join(dir,'snapshot.json');
 try{
  await fs.writeFile(file,'previous publication');
  const snapshot={schemaVersion:1,league:'high-school-basketball',season:2027,generatedAt:now.toISOString(),
   schools:[{schoolId:'providence-tn-varsity',mode:'automatic',fetchedAt:'2026-11-11T10:00:00.000Z',games:[game]}],sources:[]};
  await assert.rejects(publishSnapshot(snapshot,{file,now}),/no current automatic source/);
  assert.equal(await fs.readFile(file,'utf8'),'previous publication');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
