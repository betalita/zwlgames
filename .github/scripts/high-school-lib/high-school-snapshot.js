'use strict';
const { normalizeRecord } = require('./high-school-records');
const { SCHOOLS, LEAGUE, SEASON } = require('./high-school-roster');
const { SEEDS } = require('./high-school-schedule-seeds');
const SEED_VERIFIED_AT='2026-11-11T00:00:00.000Z';
function reviewedSeed(record){
  const seed=SEEDS.find(s=>s.id===record?.id);
  return !!seed&&record.bootstrap===true&&Object.keys(seed).every(k=>record[k]===seed[k])&&
    Object.keys(record).every(k=>k==='bootstrap'||Object.hasOwn(seed,k));
}
const SNAPSHOT_URL='https://raw.githubusercontent.com/betalita/zwlgames/master/data/high-school-2026-27.json';
const API_URL='https://api.github.com/repos/betalita/zwlgames/contents/data/high-school-2026-27.json?ref=master';
function timestamp(value,now) {
  const at=typeof value==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)?Date.parse(value):NaN;
  if(!Number.isFinite(at)||at>now.getTime()+300000||now.getTime()-at>72*3600000)
    throw new Error('high school snapshot stale, expired or future timestamp');
  return at;
}
function validateSnapshot(input,now=new Date()) {
  if(!input||input.schemaVersion!==1||input.league!==LEAGUE||input.season!==SEASON||
    !Array.isArray(input.schools)||input.schools.length>9)throw new Error('invalid high school snapshot identity');
  const published=timestamp(input.generatedAt,now),seen=new Set();
  if(input.schoolChecks){
    if(typeof input.schoolChecks!=='object'||Array.isArray(input.schoolChecks)||Object.keys(input.schoolChecks).length>9)throw Error('invalid school checks');
    for(const [id,check]of Object.entries(input.schoolChecks))if(!Object.hasOwn(SCHOOLS,id)||
      !['ok','source_error'].includes(check?.status)||timestamp(check.attemptedAt,now)>published+300000)throw Error('invalid school check');
  }
  for(const school of input.schools){
    if(!SCHOOLS[school?.schoolId]||seen.has(school.schoolId)||!Array.isArray(school.games)||school.games.length>150)
      throw new Error('invalid snapshot school');
    seen.add(school.schoolId);
    if(school.mode==='verified-seed'){
      if(school.fetchedAt!==SEED_VERIFIED_AT||!school.games.length||!school.games.every(reviewedSeed))throw new Error('unverified static seed');
    }else if(timestamp(school.fetchedAt,now)>published+300000)throw new Error('school fetched after publication');
    const ids=new Set();
    for(const record of school.games){
      if((record?.schoolId!==school.schoolId&&record?.opponentSchoolId!==school.schoolId)||ids.has(record.id))throw new Error('snapshot school/game mismatch or duplicate');
      if(record.bootstrap===true&&!reviewedSeed(record))throw new Error('unverified bootstrap record');
      ids.add(record.id);const game=normalizeRecord(record);
      if(record.evidence&&Date.parse(record.evidence.publishedAt)>Math.min(now.getTime(),published)+300000)
        throw new Error('media evidence published after snapshot');
      if(game.state==='post'&&(game.timeKnown ? Date.parse(game.startsAt.replace(' ','T')+'Z')>now.getTime()
        : record.date>new Intl.DateTimeFormat('en-CA',{timeZone:game.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now)))
        throw new Error('future high school final');
    }
  }
  return input;
}
async function loadSnapshot(url,{fetchImpl=fetch,clock=()=>new Date(),revision}={}) {
  if(url!==SNAPSHOT_URL)throw new Error('unsupported high school snapshot URL');
  if(revision!==undefined&&!/^[a-f0-9]{40}$/.test(revision))throw Error('invalid high school snapshot revision');
  const rawUrl=revision?SNAPSHOT_URL.replace('/master/','/'+revision+'/'):SNAPSHOT_URL;
  const apiUrl=revision?API_URL.replace('ref=master','ref='+revision):API_URL;
  const read=async endpoint=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
    try{
      const response=await fetchImpl(endpoint,{redirect:'error',signal:controller.signal,headers:{
        Accept:endpoint===apiUrl?'application/vnd.github.raw+json':'application/json',
        'User-Agent':'cnhoops-high-school-sync','X-GitHub-Api-Version':'2022-11-28'}});
      if(!response.ok)throw new Error(`snapshot HTTP ${response.status}`);
      if(Number(response.headers.get('content-length'))>1024*1024)throw new Error('snapshot size limit');
      const chunks=[];let size=0;
      for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024){controller.abort();throw new Error('snapshot size limit');}chunks.push(Buffer.from(chunk));}
      return validateSnapshot(JSON.parse(Buffer.concat(chunks).toString('utf8')),clock());
    }finally{clearTimeout(timer);}
  };
  try{return await read(rawUrl);}catch(rawError){
    try{return await read(apiUrl);}catch(apiError){throw new Error(`high school snapshot unavailable: Raw ${rawError.message}; API ${apiError.message}`);}
  }
}
module.exports={SNAPSHOT_URL,validateSnapshot,loadSnapshot,SEED_VERIFIED_AT};
