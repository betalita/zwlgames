'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCalendar, parsePage, collectBellaVista } = require('./high-school-lib/high-school-bella-vista');
const { normalizeRecord } = require('./high-school-lib/high-school-records');
const wrap = event => `BEGIN:VCALENDAR\nVERSION:2.0\nX-WR-TIMEZONE:America/Phoenix\n${event}\nEND:VCALENDAR`;
const event = (overrides = {}) => {
 const fields = { DTSTART:'20261113T020000Z', SUMMARY:'EYBL vs ESA', UID:'07lv8qfl25l68g81r50fh5qefu@google.com', ...overrides };
 return `BEGIN:VEVENT\n${Object.entries(fields).map(([k,v])=>`${k}:${v}`).join('\n')}\nEND:VEVENT`;
};
const html = `<div class="calendar_list_event calcat_bv" id="eventid_'cba440a4501a277e8c272618817c6a4ebbb119d69256866696a66eab64e939ec@group.calendar.google.com|07lv8qfl25l68g81r50fh5qefu'">
 <div class="details"><div class="calendar_list_title"><a href="https://www.bellavistacollegeprep.com/example">EYBL vs ESA</a></div>
 <div class="calendar_list_dt">November 12, 2026 <span class="dt_sep"> | </span> 7:00 PM - 8:30 PM</div></div></div>`;
test('HTML fallback produces the same matchup and native ID as iCalendar',async()=>{
 const rows=await collectBellaVista(async url=>{if(url.endsWith('school-calendar.cfm'))return html;throw new Error('feed down');},()=>{});
 assert.deepEqual(rows,parseCalendar(wrap(event())));
 assert.equal(parsePage(html)[0].opponent,'Elite Sports Academy');
});
test('calendar ignores other squads, old seasons, placeholders, and practice without inferring finals',()=>{
 const rows=parseCalendar(wrap([
  event(), event({SUMMARY:'BV Academy vs ESA',UID:'other@google.com'}),
  event({SUMMARY:'Girls EYBL vs ESA',UID:'girls@google.com'}),
  event({SUMMARY:'EYBL vs TBD',UID:'tbd@google.com'}),
  event({SUMMARY:'EYBL vs ESA Scrimmage',UID:'scrimmage@google.com'}),
  event({DTSTART:'20251113T020000Z',UID:'old@google.com'}),
 ].join('\n')));
 assert.equal(rows.length,1);assert.equal(rows[0].state,'pre');assert.equal(rows[0].schoolScore,undefined);
});
test('rescheduling preserves identity while cancellation stops reminders',()=>{
 const original=parseCalendar(wrap(event()))[0];
 const rescheduled=parseCalendar(wrap(event({DTSTART:'20261114T020000Z'})))[0];
 assert.equal(rescheduled.id,original.id);assert.equal(rescheduled.date,'2026-11-13');
 const cancelled=parseCalendar(wrap(event({STATUS:'CANCELLED'})))[0];
 assert.equal(cancelled.id,original.id);assert.equal(cancelled.scheduleStatus,'cancelled');
 assert.equal(normalizeRecord(cancelled).timeKnown,false);
});
test('all-day games retain an unknown time instead of turning midnight into a tipoff',()=>{
 const row=parseCalendar(wrap(event({DTSTART:undefined,'DTSTART;VALUE=DATE':'20261112'}).replace('DTSTART:undefined\n','')))[0];
 assert.equal(row.date,'2026-11-12');assert.equal(row.localTime,undefined);assert.equal(normalizeRecord(row).timeKnown,false);
});
test('invalid timezone, date, UID or conflicting event cannot produce a new verified schedule',()=>{
 assert.throws(()=>parseCalendar(wrap(event()).replace('America/Phoenix','Europe/London')),/identity|timezone/);
 assert.throws(()=>parseCalendar(wrap(event({DTSTART:'20260230T020000Z'}))),/invalid.*start/);
 assert.throws(()=>parseCalendar(wrap(event({UID:'unrelated'}))),/UID/);
 assert.throws(()=>parseCalendar(wrap(event()+'\n'+event({DTSTART:'20261114T020000Z'}))),/conflict/);
 assert.throws(()=>parseCalendar('<html>challenge</html>'),/identity/);
});
test('the guarded HTTP reader accepts the actual calendar content type',async()=>{
 const {fetchOfficialSource}=require('./high-school-lib/official-source-fetch');
 const result=await fetchOfficialSource('https://www.bellavistacollegeprep.com/calendar.ics','www.bellavistacollegeprep.com',{
  fetchImpl:async()=>new Response(wrap(event()),{headers:{'content-type':'text/calendar;charset=UTF-8'}})
 });
 assert.equal(parseCalendar(result.body.toString())[0].date,'2026-11-12');
});
