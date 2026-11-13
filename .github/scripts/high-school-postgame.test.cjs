'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {dueSchools,collect,publishSchool,publishSnapshot}=require('./high-school-collector.cjs');
const {parseMediaPage,parseMediaListing}=require('./high-school-media.cjs');
const {HIGH_SCHOOL_PLAYERS,SCHOOLS}=require('./high-school-lib/high-school-roster');
const now=new Date('2026-11-13T04:20:00Z');
const row=(p=HIGH_SCHOOL_PLAYERS[0])=>({id:'fixture-'+p.id,schoolId:p.schoolId,season:2027,date:'2026-11-12',localTime:'19:00',timeZone:'America/Phoenix',opponent:'Elite Sports Academy',venue:'unknown',state:'pre',sourceUrl:SCHOOLS[p.schoolId].url});
const snapshot=(games=[row()])=>({schemaVersion:1,league:'high-school-basketball',season:2027,generatedAt:'2026-11-13T03:00:00.000Z',schools:games.map(game=>({schoolId:game.schoolId,mode:'automatic',fetchedAt:'2026-11-13T03:00:00.000Z',games:[game]}))});
const url='https://m.zhibo8.com/news/web/nba/2026-11-13/6af68b22f283fnative.htm';
const html='<h1 class="title">张宇辰15分钟6分3篮板</h1><span class="createtime">2026-11-13 12:12:58</span><div id="content"><div>media</div><p>美高热身赛，贝拉维斯塔预科学院以78-58战胜精英体育学院。</p><p>贝拉维斯塔预科学院的张宇辰替补登场15分钟，全场3投2中，拿下6分3篮板2助攻1抢断。</p></div><p>推荐：张宇辰99分</p>';
test('all registered schools participate, future and fully checked games do not create requests',()=>{
 const before=new Date('2026-11-13T03:59:00Z');
 assert.equal(dueSchools(snapshot(),before).size,0);
 const all=snapshot(HIGH_SCHOOL_PLAYERS.map(row));assert.equal(dueSchools(all,now).size,9);
 const previous=snapshot();previous.postgameChecks={'bella-vista:fixture-zhangyuchen':{startsAt:'2026-11-13 02:00:00',sourceDate:'2026-11-12',lastCheckedAt:now.toISOString()}};
 assert.equal(dueSchools(previous,now).size,0);
 assert.equal(dueSchools(previous,new Date('2026-11-13T04:40:00Z')).size,1);
 assert.equal(dueSchools(snapshot(),new Date('2026-11-17T00:00:00Z')).size,0);
});
test('three simultaneous schools each receive a reserved media quota and rotate older articles',async()=>{
 const members=HIGH_SCHOOL_PLAYERS.slice(0,3),previous=snapshot(members.map(row));const requested=[];
 const links=members.flatMap((member,i)=>Array.from({length:6},(_,j)=>`<a href="https://news.zhibo8.com/nba/2026-11-13/school${i}article${j}.htm">${member.name}拿下6分</a>`)).join('');
 const fetchText=async u=>{if(u==='https://news.zhibo8.com/nba/')return links;if(u.includes('article'))requested.push(u);throw Error('no result');};
 const result=await collect({now,previous,postgameOnly:true,fetchText});
 assert.equal(requested.length,6);for(let i=0;i<3;i++)assert.equal(requested.filter(u=>u.includes('school'+i)).length,2);
 assert.equal(result.schools[0].fetchedAt,previous.schools[0].fetchedAt,'failures cannot refresh source freshness');
 requested.length=0;await collect({now:new Date('2026-11-13T04:40:00Z'),previous:result,postgameOnly:true,fetchText});
 assert.ok(requested.every(u=>/article[23]\.htm$/.test(u)));
});
test('official results may supersede media; unresolved equal-authority conflicts stay protected',()=>{
 const old={...row(),state:'post',schoolScore:78,opponentScore:58,sourceUrl:url,players:[{playerId:'zhangyuchen',stats:{PTS:'6'}}]};
 const entry={schoolId:'bella-vista',mode:'automatic',fetchedAt:'2026-11-13T04:00:00.000Z',games:[old]};
 const official={...old,sourceUrl:SCHOOLS['bella-vista'].url,schoolScore:80,players:[{playerId:'zhangyuchen',stats:{PTS:'7'}}]};
 assert.equal(publishSchool(entry,{schoolId:'bella-vista',games:[official]},now).games[0].players[0].stats.PTS,'7');
 assert.throws(()=>publishSchool({...entry,games:[official]},{schoolId:'bella-vista',games:[{...official,schoolScore:81}]},now),/conflict/);
});
test('failure checkpoints can persist without claiming a successful or fresh source',async()=>{
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
 const previous=snapshot();const result=await collect({now,previous,postgameOnly:true,fetchText:async()=>{throw Error('HTTP 503');}});
 assert.equal(result.schools[0].fetchedAt,previous.schools[0].fetchedAt);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hs-checkpoint-'));
 try{const file=path.join(dir,'snapshot.json');await assert.rejects(publishSnapshot(result,{file,now}),/automatic source/);
  await publishSnapshot(result,{file,now,allowCheckpoints:true});const saved=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(saved.schools[0].fetchedAt,previous.schools[0].fetchedAt);assert.equal(dueSchools(saved,now).size,0);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('media parsing scopes statistics to article body, never recommendations or script data',()=>{
 const e=parseMediaPage(html,url);assert.ok(e);assert.equal(e.paragraphs.length,2);assert.ok(!e.paragraphs.join(' ').includes('99'));
 assert.equal(parseMediaPage(html.replace('id="content"','id="other"'),url),null);
 const listing=`<a href="${url}">张宇辰拿下6分</a><a href="https://evil.test/nba/2026-11-13/fake.htm">张宇辰</a>`;
 assert.deepEqual(parseMediaListing(listing,['张宇辰']).map(x=>x.url),[url]);
});
test('postgame no-op has zero external reads; due schools share one listing and retain untouched freshness',async()=>{
 const previous=snapshot();let calls=[];
 const early=await collect({now:new Date('2026-11-13T03:00:00Z'),previous,postgameOnly:true,fetchText:async u=>{calls.push(u);throw Error('must not fetch');}});
 assert.equal(calls.length,0);assert.equal(early.generatedAt,previous.generatedAt);
 const other={schoolId:'link-hs-elite',mode:'automatic',fetchedAt:'2026-11-13T03:00:00.000Z',games:[{...row(HIGH_SCHOOL_PLAYERS.find(p=>p.schoolId==='link-hs-elite')),date:'2026-11-20'}]};
 previous.schools.push(other);
 const result=await collect({now,previous,postgameOnly:true,fetchText:async u=>{
  calls.push(u);if(u==='https://news.zhibo8.com/nba/')return `<a href="${url}">张宇辰拿下6分</a>`;if(u===url)return html;throw Error('source outage');
 }});
 assert.equal(calls.filter(u=>u==='https://news.zhibo8.com/nba/').length,1);
 const game=result.schools.find(s=>s.schoolId==='bella-vista').games[0];assert.equal(game.state,'post');assert.equal(game.players[0].stats.PTS,'6');
 assert.equal(result.schools.find(s=>s.schoolId==='link-hs-elite').fetchedAt,other.fetchedAt);
 assert.ok(!calls.some(u=>u.includes('linkhoops.com')));
 assert.equal(dueSchools(result,now).size,0);
});
