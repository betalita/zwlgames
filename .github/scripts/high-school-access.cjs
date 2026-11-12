'use strict';
const fs = require('node:fs/promises');
const TARGETS = [
  {id:'maxpreps-providence',kind:'maxpreps',school:'Providence Christian Academy',year:'26-27',url:'https://www.maxpreps.com/tn/murfreesboro/providence-christian-academy-lions/basketball/schedule/'},
  {id:'maxpreps-veritas',kind:'maxpreps',school:'Veritas Academy',year:'26-27',url:'https://www.maxpreps.com/ca/ontario/veritas-academy-titans/basketball/schedule/'},
  {id:'maxpreps-peddie',kind:'maxpreps',school:'Peddie',year:'26-27',url:'https://www.maxpreps.com/nj/hightstown/peddie-falcons/basketball/schedule/'},
  {id:'eybl-current-stats',kind:'eybl',url:'https://nikeeyblscholastic.com/stats.aspx?path=mbball&year=2026'},
  {id:'legit-historical-box',kind:'legit',url:'https://legitgm.com/stats/game/5a6459d4-a2f2-400d-b9b7-0fa7f3c2650c/print'},
];
function inspectSource(target,status,body) {
  if (status!==200) return {readable:false,reason:`HTTP ${status}`};
  if (/cf-chl-|verify you are human|just a moment|access denied|captcha/i.test(body))
    return {readable:false,reason:'access challenge'};
  if (target.kind==='maxpreps') {
    try {
      const raw=/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(body)?.[1];
      const p=JSON.parse(raw).props.pageProps, t=p.teamContext.data;
      if (t.schoolName!==target.school || t.year!==target.year || t.gender!=='Boys' || t.sport!=='Basketball' ||
          (t.level||t.teamLevel)!=='Varsity' || !Array.isArray(p.contests)) throw new Error('wrong identity');
      return {readable:true,reason:'requested boys varsity season and schedule payload found'};
    } catch { return {readable:false,reason:'requested team/season/schedule payload missing'}; }
  }
  if (target.kind==='eybl' && /2026-2027 Men's Basketball/.test(body))
    return {readable:true,currentStats:!/no statistics available/i.test(body),
      reason:/no statistics available/i.test(body)?'current season statistics not published':'statistics page available'};
  if (target.kind==='legit' && /Wasatch Academy/.test(body) && ['MIN','PTS','REB','AST','FG'].every(k=>body.includes(k)))
    return {readable:true,reason:'historical box score found; current tracked-player coverage unverified'};
  return {readable:false,reason:'expected content missing'};
}
async function readPage(url,{fetchImpl=fetch,timeoutMs=25000,maxBytes=3*1024*1024}={}) {
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const response=await fetchImpl(url,{redirect:'error',signal:controller.signal,
      headers:{'User-Agent':'cnhoops-high-school-sync/1.0',Accept:'text/html'}});
    if(Number(response.headers.get('content-length'))>maxBytes)throw new Error('source size limit');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>maxBytes){controller.abort();throw new Error('source size limit');}chunks.push(Buffer.from(chunk));}
    return {status:response.status,body:Buffer.concat(chunks).toString('utf8')};
  } finally {clearTimeout(timer);}
}
async function run() {
  const results=[];
  for(const target of TARGETS){
    const start=Date.now();let result;
    try {const response=await readPage(target.url);result={status:response.status,...inspectSource(target,response.status,response.body)};}
    catch(error){result={status:null,readable:false,reason:String(error.message).slice(0,200)};}
    results.push({id:target.id,url:target.url,...result,elapsedMs:Date.now()-start});
    console.log(target.id,JSON.stringify(result));
  }
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),runner:process.env.GITHUB_ACTIONS?'github-actions':'local',
    note:'A single successful probe does not establish long-term availability or current player statistics coverage.',results};
  await fs.mkdir('data',{recursive:true});await fs.writeFile('data/high-school-access.json',JSON.stringify(report,null,2)+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,
    results.map(r=>`${r.id}: HTTP ${r.status??'error'}; ${r.reason}`).join('\n\n'));
}
module.exports={inspectSource,readPage,TARGETS};
if(require.main===module)run().catch(error=>{console.error(error.message);process.exitCode=1;});
