'use strict';
const fs=require('node:fs/promises');const path=require('node:path');
const {SCHOOLS,SEASON,LEAGUE}=require('./high-school-lib/high-school-roster');
const {SEEDS}=require('./high-school-lib/high-school-schedule-seeds');
const {parseSchoolSchedule}=require('./high-school-lib/high-school-sources');
const {validateSnapshot,SEED_VERIFIED_AT}=require('./high-school-lib/high-school-snapshot');
const {fetchOfficialSource}=require('./high-school-lib/official-source-fetch');
const {MAXPREPS,LEGIT_TEAMS,parseMaxPreps,parseLegitBox,mergeSchedules}=require('./high-school-lib/high-school-external');
const FILE='data/high-school-2026-27.json';
const day=value=>new Date(value).toISOString().slice(0,10);
const same=(a,b)=>a.id===b.id||a.schoolId===b.schoolId&&a.date===b.date&&a.opponent.toLowerCase()===b.opponent.toLowerCase();
function publishSchool(previous,current,now){
 if(!current){
  if(!previous||previous.mode!=='verified-seed'&&now.getTime()-Date.parse(previous.fetchedAt)>72*3600000)return null;
  return previous;
 }
 if(current.games.every(g=>g.bootstrap===true)&&previous?.games.some(g=>g.bootstrap!==true))
   return publishSchool(previous,null,now);
 const games=current.games.map(row=>{
  const old=previous?.games.find(r=>same(r,row));
  if(!old||old.state!=='post')return row;
  if(row.state==='pre')return old;
  if(row.schoolScore!==old.schoolScore||row.opponentScore!==old.opponentScore)throw new Error('confirmed final score conflict');
  const players=new Map((old.players||[]).map(p=>[p.playerId,p]));
  for(const player of row.players||[]){
   const prior=players.get(player.playerId);
   if(prior&&(prior.stats&&player.dnp||prior.dnp&&player.stats))throw new Error('DNP/ready statistics conflict');
   players.set(player.playerId,prior?.stats&&player.stats?{...prior,...player,stats:{...prior.stats,...player.stats}}:player);
  }
  return {...row,players:[...players.values()]};
 });
 for(const old of previous?.games||[])if(old.state==='post'&&!games.some(g=>same(g,old)))games.push(old);
 const mode=games.every(g=>g.bootstrap===true)?'verified-seed':'automatic';
 const result={...current,mode,fetchedAt:mode==='verified-seed'?SEED_VERIFIED_AT:now.toISOString(),games};
 validateSnapshot({schemaVersion:1,league:LEAGUE,season:SEASON,generatedAt:now.toISOString(),schools:[result]},now);
 return result;
}
async function defaultFetch(url){
 const result=await fetchOfficialSource(url,new URL(url).hostname,{timeoutMs:20000,maxBytes:3*1024*1024});
 if(!result.contentType.includes('text/html')&&!result.contentType.includes('application/pdf'))throw new Error('source content type');
 return result.body.toString('utf8');
}
async function collect({now=new Date(),previous=null,fetchText=defaultFetch}={}){
 const sources=[],schools=[],cache=new Map();
 const read=url=>{if(!cache.has(url))cache.set(url,fetchText(url));return cache.get(url);};
 for(const [schoolId,school] of Object.entries(SCHOOLS)){
  const old=previous?.schools?.find(s=>s.schoolId===schoolId);let records=null;
  const report=(source,status,message,games)=>sources.push({schoolId,source,status,message,games});
  try{
   if(school.adapter){records=parseSchoolSchedule(schoolId,await read(school.url));report('official','ok',null,records.length);}
   else if(school.seed){
    records=SEEDS.filter(r=>r.schoolId===schoolId||r.opponentSchoolId===schoolId).map(r=>({...r,bootstrap:true}));
    if(!records.length)throw new Error('verified seeds missing');
    const page=await read(schoolId==='wasatch-national'?school.url:records[0].sourceUrl);
    if(schoolId==='wasatch-national'&&!page.includes('2026-27-Schedule.pdf'))throw new Error('reviewed schedule link is no longer present');
    report('verified-seed','ok','2026-11-11 transcription; source availability rechecked',records.length);
   }else report('official','pending','awaiting a verified schedule for this exact squad',0);
  }catch(error){report('official','error',error.message);records=null;}
  if(MAXPREPS[schoolId]){
   try{
    const extra=parseMaxPreps(schoolId,await read(MAXPREPS[schoolId].url),MAXPREPS[schoolId].url);
    if(extra.length){
     records=mergeSchedules(records||[],extra,{onConflict:message=>report('maxpreps-identity','warning',message)});
     report('maxpreps','ok',null,extra.length);
    }
    else report('maxpreps','pending','no individually dated current matchups',0);
   }catch(error){report('maxpreps','error',error.message);}
  }
  // Only follow links from the registered team page. Bound work and require a
  // current known matchup, exact player name, final scores and consistent box.
  if(records?.length&&LEGIT_TEAMS[schoolId]){
   try{
    const teamUrl=`https://legitgm.com/stats/team?team=${LEGIT_TEAMS[schoolId].id}`;
    const body=await read(teamUrl);
    const links=[...new Set([...body.matchAll(/href="(\/stats\/game\/[a-f0-9-]{36})(?:\/print)?"/gi)].map(m=>m[1]))].slice(0,4);
    let matched=0;
    const due=records.filter(r=>r.schoolId===schoolId&&r.date<=day(now)&&r.date>=day(now.getTime()-7*86400000));
    for(const link of due.length?links:[]){
     const url='https://legitgm.com'+link+'/print',html=await read(url);
     for(let i=0;i<records.length;i++)if(due.includes(records[i])){
      try{records[i]=parseLegitBox(html,records[i],url);matched++;break;}catch{/* Another date/opponent or inconsistent data is never imported. */}
     }
    }
    report('legitgm',matched?'ok':'pending',matched?null:'no verified current matchup/player statistics found',matched);
   }catch(error){report('legitgm','error',error.message);}
  }
  try{
   const entry=publishSchool(old,records?.length?{schoolId,games:records}:null,now);
   if(entry)schools.push(entry);
  }catch(error){report('publication','error',error.message);const entry=publishSchool(old,null,now);if(entry)schools.push(entry);}
 }
 const result={schemaVersion:1,league:LEAGUE,season:SEASON,generatedAt:now.toISOString(),schools,sources};
 validateSnapshot(result,now);return result;
}
async function publishSnapshot(snapshot,{file=FILE,now=new Date()}={}){
 validateSnapshot(snapshot,now);
 if(!snapshot.schools.some(s=>s.mode==='automatic'&&s.fetchedAt===snapshot.generatedAt))
   throw new Error('no current automatic source succeeded; existing publication retained');
 await fs.mkdir(path.dirname(file),{recursive:true});
 await fs.writeFile(file+'.tmp',JSON.stringify(snapshot,null,2)+'\n');await fs.rename(file+'.tmp',file);
}
async function main(){
 let previous=null;
 try{previous=JSON.parse(await fs.readFile(FILE,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const snapshot=await collect({previous});
 console.log(JSON.stringify({sources:snapshot.sources},null,2));
 await publishSnapshot(snapshot);
 console.log(JSON.stringify({schools:snapshot.schools.map(s=>({schoolId:s.schoolId,games:s.games.length,fetchedAt:s.fetchedAt})),sources:snapshot.sources},null,2));
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
  snapshot.schools.map(s=>`${s.schoolId}: ${s.games.length} games; source checked ${s.fetchedAt}`).join('\n\n'));
}
module.exports={collect,publishSchool,publishSnapshot};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
