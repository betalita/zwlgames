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
