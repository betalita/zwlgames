const test=require('node:test');const assert=require('node:assert/strict');
const {parseDetails}=require('./fsw-details.cjs');const f=require('./fixtures/fsw-albany.cjs');
const seed={opponent:'Albany Technical College'};const result={schoolScore:85,opponentScore:103};
test('official full-game structure provides both rosters, starter groups and team comparisons',()=>{
 const d=parseDetails(f.html(),seed,result,f.teamHtml());
 assert.equal(d.school.groups.flatMap(g=>g.athletes).length,13);
 assert.equal(d.opponent.groups.flatMap(g=>g.athletes).length,13);
 const zhao=d.school.groups[0].athletes.find(a=>a.id==='zhaoweilun');
 assert.equal(zhao.name,'Weilun Zhao');assert.equal(zhao.stats[0],'39');assert.equal(zhao.stats.at(-1),'22');
 assert.equal(d.school.statistics.find(x=>x.name==='FG').value,'30-67');
 assert.equal(d.school.statistics.find(x=>x.name==='PF').value,'36');
 assert.equal(d.opponent.statistics.find(x=>x.name==='PF').value,'18');
 assert.equal(d.school.statistics.find(x=>x.name==='PAINT').value,'34');
});
test('missing and inconsistent cells are omitted without inventing zero or DNP',()=>{
 const html=f.html().replace('6-20','6-2').replace('<td>39</td>','<td>--</td>');
 const d=parseDetails(html,seed,result,f.teamHtml());const z=d.school.groups.flatMap(g=>g.athletes).find(a=>a.id==='zhaoweilun');
 assert.equal(z.stats[0],null);assert.equal(z.stats[1],null);assert.equal(z.didNotPlay,false);
 assert.equal(d.school.statistics.find(x=>x.name==='FG'),undefined);
});
test('individual fouls beyond the college foul-out limit are omitted without discarding team totals',()=>{
 const html=f.html().replace('<td>2</td><td>5</td><td>22</td>','<td>2</td><td>6</td><td>22</td>');
 const d=parseDetails(html,seed,result);
 assert.equal(d.school.groups[0].athletes[0].stats[11],null);
 assert.equal(d.school.statistics.some(s=>s.name==='PF'),false);
});
test('all-one minutes and incomplete starter markers cannot produce false minute or starter claims',()=>{
 const html=f.html().replace(/<td>(?:39|22|6|21|35|10|14|5|7|12|8)<\/td>/g,'<td>1</td>');
 const d=parseDetails(html,seed,result);assert.ok(d.school.groups.flatMap(g=>g.athletes).every(a=>a.stats[0]===null));
});
test('foreign or conflicting team-stat pages are ignored; verified boxscore remains usable',()=>{
 const d=parseDetails(f.html(),seed,result,f.teamHtml().replaceAll('Albany Technical College','Other College'));
 assert.equal(d.school.statistics.some(x=>x.name==='PAINT'),false);
 assert.equal(d.school.statistics.find(x=>x.name==='REB').value,'25');
 assert.deepEqual(parseDetails(f.html().replaceAll('Albany Technical College','Other'),seed,result),{});
});
test('contradictory turnovers and zero foul placeholders are blanked for every affected player',()=>{
 const html=f.html().replace('<td>36</td>','<td>0</td>').replace('<td>10</td><td>0</td><td>1</td>','<td>0</td><td>0</td><td>1</td>');
 // Change only the recorded team turnover total; the opponent has seven steals.
 const broken=html.replace('<td>6</td><td>7</td><td>1</td><td>10</td>','<td>6</td><td>7</td><td>1</td><td>0</td>');
 const d=parseDetails(broken,seed,result);
 assert.ok(d.school.groups.flatMap(g=>g.athletes).every(a=>a.stats[10]===null&&a.stats[11]===null));
 assert.equal(d.school.statistics.some(s=>s.name==='TO'||s.name==='PF'),false);
});
test('explicit DNP does not create zero statistics and missing rows are not inferred',()=>{
 const d=parseDetails(f.html().replace('<td>0 Weilun Zhao</td><td>39</td><td>6-20</td><td>2-8</td><td>8-9</td><td>0</td><td>3</td><td>3</td><td>0</td><td>0</td><td>0</td><td>2</td><td>5</td><td>22</td>','<td>0 Weilun Zhao</td><td>DNP</td>'),seed,result);
 const z=d.school.groups.flatMap(g=>g.athletes).find(a=>a.id==='zhaoweilun');assert.equal(z.didNotPlay,true);assert.ok(z.stats.every(v=>v===null));
});
