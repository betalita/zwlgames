'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {setTimeout:pause}=require('node:timers/promises');
const {parseDetails,KEYS}=require('./fsw-details.cjs');
const {buildPublication,writePublication,postgameCandidates,serializeSnapshot,INDEX_PATH}=require('./fsw-publication.cjs');
const BASE='https://www.fswbucs.com/sports/mbkb/2026-27';
const plain=html=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]*>/g,' ')
 .replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#39;|&apos;/g,"'").replace(/\s+/g,' ').trim();
const norm=text=>plain(text).toLowerCase().replace(/\b(university|community|college)\b/g,'').replace(/[^a-z0-9]/g,'');
const isSchool=text=>norm(text).includes('floridasouthwestern');
function parseCalendar(text){
 if(!text.includes('BEGIN:VCALENDAR'))throw new Error('invalid FSW calendar');
 const events=new Map();
 text=text.replace(/\r?\n[ \t]/g,'');
 for(const block of text.split('BEGIN:VEVENT').slice(1)){
  const uid=block.match(/(?:^|\n)UID:([^@\r\n]+)/)?.[1];
  const start=block.match(/(?:^|\n)DTSTART([^:\r\n]*):([^\r\n]+)/);
  const summary=block.match(/(?:^|\n)SUMMARY:([^\r\n]+)/)?.[1]||'';
  if(!uid||!start||events.has(uid))throw new Error('invalid calendar event identity');
  let startsAt=null;
  if(start[1]===';VALUE=DATE'){
   if(!/^20\d{6}$/.test(start[2]))throw new Error('invalid date-only event');
  }else{
   if(start[1]!==''||!/^20\d{6}T\d{6}Z$/.test(start[2]))throw new Error('calendar requires explicit UTC');
   const iso=start[2].replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,'$1-$2-$3T$4:$5:$6.000Z');
   if(!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString()!==iso)throw new Error('invalid calendar time');
   startsAt=iso;
  }
  events.set(uid,{startsAt,summary,sourceDate:start[2].slice(0,8).replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')});
 }
 return events;
}
function rows(html){return [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
 .map(match=>[...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>plain(cell[1])));}
function parseBoxscore(html,seed){
 const heading=plain(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]||'');
 if(!isSchool(heading)||!norm(heading).includes(norm(seed.opponent)))throw new Error('boxscore identity mismatch');
 const tables=[...html.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(match=>rows(match[0]));
 const scoreTable=tables.find(table=>table.some(row=>row.some(cell=>/^Final(?:\s|$)/i.test(cell))));
 if(!scoreTable)return null;
 const teamRows=scoreTable.filter(row=>row.length>=4 && /^\d+$/.test(row.at(-1)) && !/^Final/i.test(row[0]));
 const school=teamRows.find(row=>isSchool(row[0]));
 const other=teamRows.find(row=>norm(row[0])===norm(seed.opponent));
 if(!school||!other)throw new Error('final score team identity mismatch');
 const numbers=row=>row.slice(1).map(Number);
 const s=numbers(school),o=numbers(other);
 if([...s,...o].some(x=>!Number.isInteger(x)||x<0||x>300)||s.slice(0,-1).reduce((a,b)=>a+b,0)!==s.at(-1)||o.slice(0,-1).reduce((a,b)=>a+b,0)!==o.at(-1))throw new Error('invalid period score');
 const result={schoolScore:s.at(-1),opponentScore:o.at(-1),schoolPeriods:s.slice(0,-1),opponentPeriods:o.slice(0,-1),stats:null};
 result.details=parseDetails(html,seed,result);
 const zhao=result.details.school?.groups.flatMap(g=>g.athletes).find(a=>a.id==='zhaoweilun'&&!a.didNotPlay);
 if(zhao)result.stats=Object.fromEntries(KEYS.flatMap((key,i)=>zhao.stats[i]===null?[]:[[key,zhao.stats[i]]]));
 return result;
}
async function fetchText(url){
 const allowed=new URL(url);if(allowed.origin!=='https://www.fswbucs.com')throw new Error('unexpected source host');
 const response=await fetch(url,{redirect:'error',headers:{'User-Agent':'cnhoops-schedule-collector/1.0','Accept':'text/html,text/calendar;q=0.9,*/*;q=0.8'},signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw new Error(`FSW HTTP ${response.status}: ${allowed.pathname}`);
 let size=0;const chunks=[];for await(const chunk of response.body){size+=chunk.length;if(size>3*1024*1024)throw new Error('source size exceeded');chunks.push(chunk);}
 const text=Buffer.concat(chunks).toString('utf8');
 if(/cf-chl-|just a moment|verify you are human|request blocked/i.test(text))throw new Error('FSW access challenge');
 await pause(700);return text;
}
async function collect({seeds=require('./fsw-games.json'),fetchText:read=fetchText,clock=()=>new Date()}={}){
 const [schedule,ical]=await Promise.all([read(`${BASE}/schedule`),read(`${BASE}/schedule?print=ical`)]);
 if(!/Florida SouthWestern/i.test(schedule)||!schedule.includes('2026-27'))throw new Error('schedule identity mismatch');
 const calendar=parseCalendar(ical);const games=[];
 const links=[...schedule.matchAll(/href\s*=\s*["']([^"']*\/boxscores\/[^"']+)["']/gi)].map(m=>new URL(m[1].replace(/&amp;/g,'&'),BASE+'/schedule'));
 for(const seed of seeds){
  const event=calendar.get(seed.uid);
  if(!event||!isSchool(event.summary)||!norm(event.summary).includes(norm(seed.opponent)))throw new Error(`calendar missing/mismatched known game ${seed.uid}`);
  const timeZone=seed.timeZone||(seed.location==='Waco, TX'?'America/Chicago':'America/New_York');
  const sourceDate=event.startsAt?new Intl.DateTimeFormat('sv-SE',{timeZone}).format(new Date(event.startsAt)):event.sourceDate;
  let result=null;
  if(event.startsAt&&Date.parse(event.startsAt)<clock().getTime()){
   // Link must be present in the current official schedule, never fabricated.
   const link=links.find(url=>url.origin==='https://www.fswbucs.com'&&url.pathname.includes(`_${seed.uid.slice(0,4)}.xml`));
   if(link){
    try{
    const boxHtml=await read(link.href);result=parseBoxscore(boxHtml,seed);
    if(result){
     result.sourceUrl=link.href;
     let teamHtml='';
     if(/(?:id=["']teamstats-tab|view=teamstats)/i.test(boxHtml)){
      try{teamHtml=await read(link.href+'?view=teamstats');}
      catch(error){console.warn('Optional FSW team comparison unavailable: '+error.message);}
     }
     result.details=parseDetails(boxHtml,seed,result,teamHtml);
    }
    }catch(error){console.warn(`FSW game ${seed.id} unavailable: ${error.message}`);}
   }
  }
  games.push({id:seed.id,uid:seed.uid,sourceDate,opponent:seed.opponent,venue:seed.venue,
   startsAt:event.startsAt,timeKnown:!!event.startsAt,result});
 }
 return {schemaVersion:1,season:2027,school:'official-fsw',generatedAt:clock().toISOString(),sourceUrl:`${BASE}/schedule`,games};
}
async function main(){
 let previous=null;
 try{previous=JSON.parse(await fs.readFile(path.resolve(INDEX_PATH),'utf8'));}
 catch(error){if(error.code!=='ENOENT')throw error;}
 let seeds=require('./fsw-games.json');
 if(process.env.FSW_COLLECT_MODE==='postgame'){
  const ids=new Set(postgameCandidates(previous));seeds=seeds.filter(g=>ids.has(g.id));
  if(!seeds.length){console.log('No FSW games in postgame collection window');return;}
 }
 const snapshot=await collect({seeds});
 const publication=buildPublication(snapshot,previous);
 await writePublication(publication);
 const finals=snapshot.games.filter(game=>game.result).length;
 const detailGames=snapshot.games.filter(g=>g.result&&Object.keys(g.result.details||{}).length).length;
 const summary=`FSW 采集成功：本次检查 ${snapshot.games.length} 场，${finals} 场完赛，${detailGames} 场含详情统计；索引 ${(Buffer.byteLength(serializeSnapshot(publication.index))/1024).toFixed(1)} KiB，写入 ${publication.files.size} 个单场文件；生成时间 ${snapshot.generatedAt}。\n`;
 console.log(summary);if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,summary);
}
module.exports={parseCalendar,parseBoxscore,collect,serializeSnapshot};
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
