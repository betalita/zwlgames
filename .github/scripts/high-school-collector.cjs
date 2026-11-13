'use strict';
const fs=require('node:fs/promises');const path=require('node:path');
const {SCHOOLS,SEASON,LEAGUE}=require('./high-school-lib/high-school-roster');
const {SEEDS}=require('./high-school-lib/high-school-schedule-seeds');
const {parseSchoolSchedule}=require('./high-school-lib/high-school-sources');
const {validateSnapshot,SEED_VERIFIED_AT}=require('./high-school-lib/high-school-snapshot');
const {fetchOfficialSource}=require('./high-school-lib/official-source-fetch');
const {MAXPREPS,LEGIT_TEAMS,parseMaxPreps,parseLegitBox,mergeSchedules}=require('./high-school-lib/high-school-external');
const {collectBellaVista}=require('./high-school-lib/high-school-bella-vista');
const {collectNotreDame}=require('./high-school-lib/high-school-neprep');
const {HIGH_SCHOOL_PLAYERS}=require('./high-school-lib/high-school-roster');
const {normalizeRecord}=require('./high-school-lib/high-school-records');
const {recoverHighSchoolDeadline,highSchoolTiming}=require('./high-school-lib/high-school-postgame');
const {mediaResult,isMediaUrl}=require('./high-school-lib/high-school-media-evidence');
const {LISTING,parseMediaListing,parseMediaPage}=require('./high-school-media.cjs');
const FILE='data/high-school-2026-27.json';
const day=value=>new Date(value).toISOString().slice(0,10);
const same=(a,b)=>a.id===b.id||a.schoolId===b.schoolId&&a.date===b.date&&a.opponent.toLowerCase()===b.opponent.toLowerCase();
const checkKey=r=>`${r.schoolId}:${r.id}`;
function timing(record,previous){
 const g=normalizeRecord(record),old=previous?.postgameChecks?.[checkKey(record)];
 return {...g,...highSchoolTiming(g),starts_at:g.startsAt,players:g.players,
  ...(old?.startsAt===g.startsAt&&old.sourceDate===record.date?{last_checked_at:old.lastCheckedAt}:{} )};
}
function dueSchools(previous,now=new Date()){
 const due=new Map();
 for(const entry of previous?.schools||[])for(const record of entry.games||[]){
  try{const next=recoverHighSchoolDeadline(timing(record,previous),now);if(!next||next.getTime()>now.getTime())continue;
   if(!due.has(entry.schoolId))due.set(entry.schoolId,new Set());due.get(entry.schoolId).add(checkKey(record));
  }catch{/* Unverified identities/timing cannot create postgame work. */}
 }
 return due;
}
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
  const officialUpgrade=isMediaUrl(old.sourceUrl)&&!isMediaUrl(row.sourceUrl)&&row.date===old.date&&row.schoolId===old.schoolId&&row.opponent===old.opponent;
  if(row.schoolScore!==old.schoolScore||row.opponentScore!==old.opponentScore){if(!officialUpgrade)throw new Error('confirmed final score conflict');return {...row,evidence:undefined};}
  if(officialUpgrade)return {...row,evidence:undefined};
  const players=new Map((old.players||[]).map(p=>[p.playerId,p]));
  for(const player of row.players||[]){
   const prior=players.get(player.playerId);
   if(prior&&(prior.stats&&player.dnp||prior.dnp&&player.stats))throw new Error('DNP/ready statistics conflict');
   if(prior?.stats&&player.stats&&Object.entries(player.stats).some(([k,v])=>prior.stats[k]!=null&&String(prior.stats[k])!==String(v)))throw new Error('confirmed player statistics conflict');
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
 const result=await fetchOfficialSource(url,new URL(url).hostname,{timeoutMs:12000,maxBytes:3*1024*1024});
 if(!['text/html','application/pdf','text/calendar'].includes(result.contentType))throw new Error('source content type');
 return result.body.toString('utf8');
}
async function collect({now=new Date(),previous=null,fetchText=defaultFetch,postgameOnly=false}={}){
 const due=dueSchools(previous,now);
 if(postgameOnly&&!due.size)return previous;
 const sources=[],schools=[],cache=new Map();
 const lastCheck=schoolId=>Math.min(...[...(due.get(schoolId)||[])].map(key=>Date.parse(previous?.postgameChecks?.[key]?.lastCheckedAt)||0));
 const selected=new Set([...due.keys()].sort((a,b)=>lastCheck(a)-lastCheck(b)).slice(0,3));
 let mediaReads=0;
 const postgameChecks={...(previous?.postgameChecks||{})};
 const read=url=>{if(!cache.has(url))cache.set(url,fetchText(url));return cache.get(url);};
 for(const [schoolId,school] of Object.entries(SCHOOLS)){
  const old=previous?.schools?.find(s=>s.schoolId===schoolId);let records=null;
  if(postgameOnly&&!selected.has(schoolId)){const retained=publishSchool(old,null,now);if(retained)schools.push(retained);continue;}
  const report=(source,status,message,games)=>sources.push({schoolId,source,status,message,games});
  try{
   if(schoolId==='bella-vista'){
    const calendar=await collectBellaVista(read,report);
    const seeds=SEEDS.filter(r=>r.schoolId===schoolId||r.opponentSchoolId===schoolId).map(r=>({...r,bootstrap:true}));
    records=mergeSchedules(seeds,calendar);
   }
   else if(schoolId==='notre-dame-prep-ny')records=await collectNotreDame(read,report);
   else if(school.adapter){records=parseSchoolSchedule(schoolId,await read(school.url));report('official','ok',null,records.length);}
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
    const pending=records.filter(r=>r.schoolId===schoolId&&r.date<=day(now)&&r.date>=day(now.getTime()-7*86400000)&&(!postgameOnly||due.get(schoolId)?.has(checkKey(r))));
    for(const link of pending.length?links:[]){
     const url='https://legitgm.com'+link+'/print',html=await read(url);
     for(let i=0;i<records.length;i++)if(pending.includes(records[i])){
      try{records[i]=parseLegitBox(html,records[i],url);matched++;break;}catch{/* Another date/opponent or inconsistent data is never imported. */}
     }
    }
    report('legitgm',matched?'ok':'pending',matched?null:'no verified current matchup/player statistics found',matched);
   }catch(error){report('legitgm','error',error.message);}
  }
  // Media may only supplement an already known exact fixture. A single cached
  // listing is shared across every due school; only followed articles are read.
  if(due.has(schoolId)){
   try{
    const baseRecords=records?.length?records:old?.games;
    if(baseRecords?.length){
     const members=HIGH_SCHOOL_PLAYERS.filter(p=>p.schoolId===schoolId);
     const allLinks=parseMediaListing(await read(LISTING),members.flatMap(p=>[p.name,p.englishName,...(p.aliases||[])]));
     const attempts=Math.min(...[...due.get(schoolId)].map(key=>previous?.postgameChecks?.[key]?.attempts||0));
     const quota=postgameOnly?2:1;
     const offset=allLinks.length?(attempts*quota)%allLinks.length:0;
     const links=[...allLinks.slice(offset),...allLinks.slice(0,offset)].slice(0,quota);
     const proposals=new Map();
     for(const link of links){
      if(!cache.has(link.url)&&mediaReads>=(postgameOnly?6:HIGH_SCHOOL_PLAYERS.length))break;
      if(!cache.has(link.url))mediaReads++;
      try{
       const evidence=parseMediaPage(await read(link.url),link.url);if(!evidence)continue;
       const candidate=mediaResult(evidence,baseRecords,now);if(!candidate||!due.get(schoolId).has(checkKey(candidate)))continue;
       if(!proposals.has(candidate.id))proposals.set(candidate.id,[]);proposals.get(candidate.id).push(candidate);
      }catch(error){report('media-article','warning',error.message,0);}
     }
     let imported=0;
     for(const [id,candidates]of proposals){
      const first=candidates[0];
      const conflict=candidates.some(c=>c.schoolScore!==first.schoolScore||c.opponentScore!==first.opponentScore||c.players.some(p=>{
       const old=first.players.find(o=>o.playerId===p.playerId);return Object.entries(p.stats||{}).some(([k,v])=>old?.stats?.[k]!=null&&String(old.stats[k])!==String(v));
      }));
      if(conflict){report('media-identity','warning','conflicting reports; original data retained',0);continue;}
      candidates.sort((a,b)=>b.players.reduce((n,p)=>n+Object.keys(p.stats||{}).length,0)-a.players.reduce((n,p)=>n+Object.keys(p.stats||{}).length,0));
      records=(records||baseRecords).map(r=>r.id===id?candidates[0]:r);imported++;
     }
     report('verified-media',imported?'ok':'pending',imported?null:'no unambiguous current report',imported);
    }
   }catch(error){report('verified-media','error',error.message);}
  }
  try{
   const entry=publishSchool(old,records?.length?{schoolId,games:records}:null,now);
   if(entry)schools.push(entry);
  }catch(error){report('publication','error',error.message);const entry=publishSchool(old,null,now);if(entry)schools.push(entry);}
  for(const record of old?.games||[])if(due.get(schoolId)?.has(checkKey(record))){
   const g=normalizeRecord(record),last=postgameChecks[checkKey(record)];postgameChecks[checkKey(record)]={startsAt:g.startsAt,sourceDate:record.date,lastCheckedAt:now.toISOString(),attempts:Math.min((last?.startsAt===g.startsAt?last.attempts||0:0)+1,100)};
  }
 }
 for(const [key,check]of Object.entries(postgameChecks))if(now.getTime()-Date.parse(check.lastCheckedAt)>8*86400000)delete postgameChecks[key];
 const result={schemaVersion:1,league:LEAGUE,season:SEASON,generatedAt:now.toISOString(),schools,sources,postgameChecks};
 validateSnapshot(result,now);return result;
}
async function publishSnapshot(snapshot,{file=FILE,now=new Date(),allowCheckpoints=false}={}){
 validateSnapshot(snapshot,now);
 if(!snapshot.schools.some(s=>s.mode==='automatic'&&s.fetchedAt===snapshot.generatedAt)&&
    !(allowCheckpoints&&Object.values(snapshot.postgameChecks||{}).some(c=>c.lastCheckedAt===snapshot.generatedAt)))
   throw new Error('no current automatic source succeeded; existing publication retained');
 await fs.mkdir(path.dirname(file),{recursive:true});
 await fs.writeFile(file+'.tmp',JSON.stringify(snapshot,null,2)+'\n');await fs.rename(file+'.tmp',file);
}
async function main(){
 let previous=null;
 try{previous=JSON.parse(await fs.readFile(FILE,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const snapshot=await collect({previous,postgameOnly:process.argv.includes('--postgame')});
 if(snapshot===previous){console.log('No high school postgame checks due; no source requests or publication.');return;}
 console.log(JSON.stringify({sources:snapshot.sources},null,2));
 await publishSnapshot(snapshot,{allowCheckpoints:process.argv.includes('--postgame')});
 console.log(JSON.stringify({schools:snapshot.schools.map(s=>({schoolId:s.schoolId,games:s.games.length,fetchedAt:s.fetchedAt})),sources:snapshot.sources},null,2));
 if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
  snapshot.schools.map(s=>`${s.schoolId}: ${s.games.length} games; source checked ${s.fetchedAt}`).join('\n\n'));
}
module.exports={collect,publishSchool,publishSnapshot,dueSchools};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
