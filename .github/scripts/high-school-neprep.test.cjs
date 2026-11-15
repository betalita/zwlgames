'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseNotreDame}=require('./high-school-lib/high-school-neprep');
const fixture=name=>fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8');
const schedule=fixture('neprep-notre-dame-schedule.html'),results=fixture('neprep-notre-dame-games.html');
test('NEPrep requires explicit Final and reads a loss in tracked-team first order',()=>{
 const noFinal=parseNotreDame(schedule,results.replace(/<p\b[^>]*>\s*Final\s*<\/p>/i,''));
 assert.equal(noFinal.filter(g=>g.state==='post').length,0);
 const loss=parseNotreDame(schedule,results.replace('102 - 79','79 - 102').replace('(W)','(L)'))[0];
 assert.equal(loss.schoolScore,79);assert.equal(loss.opponentScore,102);
});
test('NEPrep native ID survives date corrections and unknown travelling venues do not invent a time',()=>{
 const changed=parseNotreDame(schedule.replace('November 13, 2026','November 15, 2026').replace('Boo Williams','Unverified venue'),results.replace(/>13<\/h1>/,'>15</h1>'));
 const game=changed.find(g=>g.id==='neprep-9808149');
 assert.equal(game.date,'2026-11-15');assert.equal(game.localTime,undefined);
});
test('NEPrep rejects incomplete result cards instead of silently refreshing a partial results source',()=>{
 const truncated=results.slice(0,results.indexOf('<div class="box"',results.indexOf('<div class="box"')+1));
 assert.throws(()=>parseNotreDame(schedule,truncated),/incomplete|matchup/);
});

test('NEPrep venue distinguishes verified opponent courts, tournaments and unknown locations',()=>{
 const games=parseNotreDame(schedule,results);
 assert.equal(games.find(g=>g.opponent==='Blair Academy (NJ)').venue,'away');
 assert.equal(games.find(g=>g.opponent==='Mercersburg Academy (PA)').venue,'away');
 assert.equal(games.find(g=>g.opponent.startsWith('Southeastern')).venue,'neutral');
 assert.equal(games.find(g=>g.date==='2027-02-21').venue,'unknown');
});

// On 2026-11-15 the source changed the second Dec 12 matchup to the
// same opponent as the first, retaining two different native schedule IDs.
const duplicateOpponent='St James Performance Academy Prep (VA)';
const duplicateSchedule=schedule.replaceAll('Prince Georges Christian Academy (MD)',duplicateOpponent);
const duplicateResults=results.replaceAll('Prince Georges Christian Academy (MD)',duplicateOpponent);
const duplicateCard=duplicateResults.split(/(?=<div class="box")/).find(card=>card.includes(duplicateOpponent));

test('duplicate future matchups do not block an unrelated verified Final or lose native schedule IDs',()=>{
 const games=parseNotreDame(duplicateSchedule,duplicateResults);
 const final=games.find(g=>g.id==='neprep-9752513');
 assert.equal(final.state,'post');assert.equal(final.schoolScore,102);assert.equal(final.opponentScore,79);
 const future=games.filter(g=>g.date==='2026-12-12');
 assert.deepEqual(future.map(g=>g.id).sort(),['neprep-9808150','neprep-9839906']);
 assert.ok(future.every(g=>g.opponent===duplicateOpponent&&g.state==='pre'&&g.schoolScore===undefined&&g.opponentScore===undefined));
 assert.equal(games.length,31);
});

test('duplicate future coverage still rejects a missing card or an excess repeated card',()=>{
 assert.throws(()=>parseNotreDame(duplicateSchedule,duplicateResults.replace(duplicateCard,'')),/incomplete|ambiguous/);
 assert.throws(()=>parseNotreDame(duplicateSchedule,duplicateResults+duplicateCard),/incomplete|ambiguous/);
});

test('a Final for a duplicate matchup cannot be assigned to either native fixture by array order',()=>{
 const finalCard=duplicateCard.replace(/<h3\b[^>]*>[\s\S]*?<\/h3>/i,'<h3>80 - 70 (W)</h3><p>Final</p>');
 assert.throws(()=>parseNotreDame(duplicateSchedule,duplicateResults.replace(duplicateCard,finalCard)),/ambiguous/);
});

test('collector publishes a newly available Final despite duplicate future matchups',async()=>{
 const {collect,publishSnapshot}=require('./high-school-collector.cjs');
 const os=require('node:os');
 const fetchText=async url=>{
  if(url==='https://www.neprepbasketball.net/team/272487/schedule')return duplicateSchedule;
  if(url==='https://www.neprepbasketball.net/team/272487/games')return duplicateResults.replace('10:00 AM\n</h3>','72 - 71 (W)\n</h3><p>Final</p>');
  throw Error('unavailable');
 };
 const at=new Date('2026-11-15T02:00:00Z');
 const snapshot=await collect({now:at,fetchText});
 const entry=snapshot.schools.find(s=>s.schoolId==='notre-dame-prep-ny');
 assert.ok(entry,'valid Notre Dame finals must reach the published snapshot');
 assert.equal(entry.fetchedAt,at.toISOString());
 assert.equal(snapshot.schoolChecks['notre-dame-prep-ny'].status,'ok');
 const game=entry.games.find(g=>g.id==='neprep-9808148');
 assert.equal(game.state,'post');assert.equal(game.schoolScore,72);assert.equal(game.opponentScore,71);
 const normalized=require('./high-school-lib/high-school-records').normalizeRecord(game);
 assert.equal(normalized.players[0].state,'missing');assert.equal(normalized.players[0].stats,null);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'neprep-publication-'));
 try{
  const file=path.join(dir,'snapshot.json');
  await publishSnapshot(snapshot,{file,now:at});
  const saved=JSON.parse(fs.readFileSync(file,'utf8')).schools.find(s=>s.schoolId==='notre-dame-prep-ny');
  assert.equal(saved.games.find(g=>g.id==='neprep-9808148').schoolScore,72);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
