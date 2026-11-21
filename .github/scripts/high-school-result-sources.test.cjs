'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const {applyFinals,parseBallfrog,parsePrepFinals,BALLFROG_URL} = require('./high-school-lib/high-school-result-sources');

const event = (patch = {}) => ({id:251773, date:'2026-11-17', event_type:'game',
  opponent:'(V) MBA', result:'W 61-52', time:'19:00:00', timezone:'America/Chicago',
  team:{id:12146,title:'Basketball Boys - HS'}, ...patch});
const response = (...events) => JSON.stringify({data:{events,total_item_count:events.length}});
const fixture = (patch={}) => ({schoolId:'providence-tn-varsity',season:2027,id:'original',
  date:'2026-11-17',opponent:'Montgomery Bell Academy',state:'pre',venue:'away', ...patch});

test('Ballfrog accepts only the registered boys varsity finals and enriches the original fixture',()=>{
 const finals = parseBallfrog(response(event(),event({id:2,opponent:'(JV) MBA',result:'L 60-65'}),
  event({id:3,opponent:'(V) Future',result:null}),event({id:4,opponent:'Unclassified'})));
 const result = applyFinals('providence-tn-varsity',[fixture()],finals);
 assert.equal(result.updated,1);
 assert.deepEqual(result.games[0],fixture({state:'post',schoolScore:61,opponentScore:52,
  sourceUrl:BALLFROG_URL,localTime:'19:00',timeZone:'America/Chicago',bootstrap:false}));
});
test('Ballfrog rejects incomplete pages, wrong team, and contradictory scores',()=>{
 assert.throws(()=>parseBallfrog(JSON.stringify({data:{events:[event()],total_item_count:2}})),/incomplete/i);
 assert.throws(()=>parseBallfrog(response(event({team:{id:567,title:'Basketball Boys - HS'}}))),/team/i);
 assert.throws(()=>parseBallfrog(response(event({result:'L 61-52'}))),/result/i);
});

function prep(title, id, opponent, score, status='Final'){
 return '<h1>'+title+'</h1><a href="/team/'+id+'">Team</a><p>2026-2027</p>'+
  '<div class="box"><h1>Nov</h1><h1>20</h1><h2>@ '+opponent+'</h2><h3>'+score+'</h3><p>'+status+'</p></div>';
}
test('NEPrep verifies the exact squad and only joins unique known fixtures',()=>{
 const html = prep('Peddie School (NJ)',261677,'Notre Dame Prep (NY)','70 - 65 (W)');
 const finals=parsePrepFinals('peddie-varsity',html);
 const g=fixture({schoolId:'peddie-varsity',date:'2026-11-20',opponent:'Notre Dame (NY)'});
 assert.equal(applyFinals('peddie-varsity',[g],finals).games[0].schoolScore,70);
 assert.throws(()=>parsePrepFinals('phelps-national',html),/team/i);
 assert.equal(parsePrepFinals('peddie-varsity',prep('Peddie School (NJ)',261677,'Notre Dame Prep (NY)','1:00 PM','Scheduled')).length,0);
 assert.equal(applyFinals('peddie-varsity',[g,{...g,id:'second'}],finals).updated,0);
 assert.equal(applyFinals('peddie-varsity',[{...g,opponent:'Unrelated School'}],finals).updated,0);
 assert.equal(applyFinals('peddie-varsity',[{...g,scheduleStatus:'cancelled'}],finals).updated,0);
 assert.deepEqual(applyFinals('peddie-varsity',[{...g,state:'post',schoolScore:71,opponentScore:65}],finals).games[0],
  {...g,state:'post',schoolScore:71,opponentScore:65});
});

test('due postgame collection publishes a Ballfrog final when the school calendar is unavailable', async () => {
 const { collect } = require('./high-school-collector.cjs');
 const { normalizeRecord } = require('./high-school-lib/high-school-records');
 const now = new Date('2026-11-18T05:30:00Z');
 const previous = { schools: [{ schoolId:'providence-tn-varsity', mode:'automatic',
  fetchedAt:'2026-11-17T18:00:00Z',
  games:[fixture({sourceUrl:'https://providencechristian.com/calendar/athletics-calendar-list/'})] }] };
 const snapshot = await collect({now,previous,postgameOnly:true,schoolIds:['providence-tn-varsity'],
  fetchText: async url => {
   if (url === BALLFROG_URL) return response(event());
   throw Error('not available');
  }});
 const school = snapshot.schools[0];
 assert.equal(school.fetchedAt, snapshot.generatedAt);
 assert.equal(school.games[0].id, 'original');
 const normalized = normalizeRecord(school.games[0]);
 assert.equal(normalized.state, 'post');
 assert.equal(normalized.players[0].state, 'missing');
 assert.ok(snapshot.sources.some(source => source.source === 'ballfrog' && source.games === 1));
});

test('Wasatch varsity source confirms only an exact, previously known game and rejects other levels', () => {
 const { parseMaxPreps, WASATCH_MAXPREPS } = require('./high-school-lib/high-school-external');
 const context = {schoolName:'Wasatch Academy',year:'26-27',gender:'Boys',sport:'Basketball',level:'Varsity'};
 const html = '<script id="__NEXT_DATA__">' +
  JSON.stringify({props:{pageProps:{teamContext:{data:context}}}}) + '</script>' +
  '<table><thead><tr><th>Date/Time</th></tr></thead><tbody><tr>' +
  '<td><a href="/game/11-20-2026/?c=12345678-0000-0000-0000-123456789012">11/20</a></td>' +
  '<td><span class="name">Oak Cliff Faith Family Academy</span></td><td>L 58-64</td></tr></tbody></table>';
 const schoolId = 'wasatch-national';
 const verified = parseMaxPreps(schoolId,html,WASATCH_MAXPREPS.url).filter(row => row.state === 'post');
 const existing = fixture({schoolId,date:'2026-11-20',opponent:'Faith Family'});
 const result = applyFinals(schoolId,[existing],verified);
 assert.equal(result.updated,1);
 assert.equal(result.games[0].id,'original');
 assert.equal(result.games[0].opponentScore,64);
 assert.equal(applyFinals(schoolId,[],verified).updated,0);
 assert.throws(() => parseMaxPreps(schoolId,html.replace('"Varsity"','"Junior Varsity"'),WASATCH_MAXPREPS.url),/identity/i);
});
