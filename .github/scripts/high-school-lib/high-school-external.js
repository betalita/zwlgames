'use strict';
const {SEASON,HIGH_SCHOOL_PLAYERS}=require('./high-school-roster');
const MAXPREPS={
  'providence-tn-varsity':{name:'Providence Christian Academy',url:'https://www.maxpreps.com/tn/murfreesboro/providence-christian-academy-lions/basketball/schedule/'},
  'veritas-national':{name:'Veritas Academy',url:'https://www.maxpreps.com/ca/ontario/veritas-academy-titans/basketball/schedule/'},
  'peddie-varsity':{name:'Peddie',url:'https://www.maxpreps.com/nj/hightstown/peddie-falcons/basketball/schedule/'},
};
const LEGIT_TEAMS={
  'wasatch-national':{name:'Wasatch Academy',id:'team-link-1767583601907-t4ovnix75'},
  'bella-vista':{name:'CIA Bella Vista',id:'team-link-1767583423947-f1td5xzvd'},
  'veritas-national':{name:'Veritas Academy',id:'3503d810-5a1d-41f4-93f7-5064f07179ce'},
};
function plain(value){return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ')
  .replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(Number(v))).replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/&(?:ndash|mdash);/g,'—').replace(/\s+/g,' ').trim();}
const key=value=>plain(value).toLowerCase().replace(/[^a-z0-9]/g,'');
const cells=row=>[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(m=>plain(m[1]));
function parseMaxPreps(schoolId,html,sourceUrl){
  const mapping=MAXPREPS[schoolId];if(!mapping)throw new Error('unverified MaxPreps school/squad mapping');
  let context;
  try{context=JSON.parse(/<script\b[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html)[1]).props.pageProps.teamContext.data;}
  catch{throw new Error('MaxPreps identity payload missing');}
  if(context.schoolName!==mapping.name||context.year!=='26-27'||context.gender!=='Boys'||context.sport!=='Basketball'||context.level!=='Varsity')
    throw new Error('MaxPreps team/season identity mismatch');
  if(sourceUrl!==mapping.url)throw new Error('unverified MaxPreps source URL');
  const table=/<table\b[^>]*>[\s\S]*?<thead>[\s\S]*?Date\/Time[\s\S]*?<\/thead>([\s\S]*?)<\/table>/i.exec(html)?.[1];
  if(!table)throw new Error('MaxPreps schedule table missing');
  const output=[];
  for(const match of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const raw=match[1],td=[...raw.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
    if(td.length<2||/scrimmage/i.test(plain(raw)))continue;
    const link=/href="([^"]*\/([0-9]{1,2})-([0-9]{1,2})-(20\d\d)\/\?c=([a-f0-9-]{36}))"/i.exec(td[0]);
    const opponent=plain(/<span\b[^>]*class="name"[^>]*>([\s\S]*?)<\/span>/i.exec(td[1])?.[1]||'');
    if(!link||!opponent||/\bTBA|\bTBD|tournament|showcase/i.test(opponent))continue;
    const date=`${link[4]}-${link[2].padStart(2,'0')}-${link[3].padStart(2,'0')}`;
    if(date<'2026-07-01'||date>'2027-06-30')throw new Error('MaxPreps game season mismatch');
    const score=/\b([WL])\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\b/i.exec(plain(td.at(-1)));
    const row={id:'mp-'+link[5],season:SEASON,schoolId,date,opponent,
      venue:/class="hat"[^>]*>\s*@/.test(td[1])?'away':'unknown',sourceUrl:new URL(link[1].replace(/&amp;/g,'&'),sourceUrl).href,state:score?'post':'pre'};
    if(/cancel|postpon/i.test(plain(raw))){row.state='pre';row.scheduleStatus=/cancel/i.test(plain(raw))?'cancelled':'postponed';}
    if(score&&!row.scheduleStatus){row.schoolScore=Number(score[2]);row.opponentScore=Number(score[3]);
      if((score[1].toUpperCase()==='W')!==(row.schoolScore>row.opponentScore)||row.schoolScore===row.opponentScore)throw new Error('MaxPreps result mismatch');}
    // The page does not explicitly identify the timezone of every displayed
    // tipoff. Keep it unknown rather than applying the school's zone to travel.
    output.push(row);
  }
  return output;
}
function mergeSchedules(primary,supplement,{onConflict}={}){
 const result=primary.map(r=>({...r}));
 for(const row of supplement){
  const sameDay=result.filter(r=>r.schoolId===row.schoolId&&r.date===row.date);
  const same=sameDay.find(r=>key(r.opponent)===key(row.opponent));
  if(same){
    if(row.scheduleStatus&&same.state!=='post')Object.assign(same,{scheduleStatus:row.scheduleStatus,sourceUrl:row.sourceUrl,bootstrap:false});
    if(same.state==='post'&&row.state==='post'&&(same.schoolScore!==row.schoolScore||same.opponentScore!==row.opponentScore))throw new Error('schedule final score conflict');
    if(same.state!=='post'&&row.state==='post')Object.assign(same,{state:'post',schoolScore:row.schoolScore,opponentScore:row.opponentScore,sourceUrl:row.sourceUrl,players:row.players,bootstrap:false});
  }else if(sameDay.length){
    const message=`same-date opponent conflict: ${row.date}; official ${sameDay.map(r=>r.opponent).join(', ')}; supplement ${row.opponent}; manual identity check required`;
    if(!onConflict)throw new Error(message);
    onConflict(message);
  }
  else result.push({...row});
 }
 return result;
}
function parseLegitBox(html,record,sourceUrl){
 const expected=LEGIT_TEAMS[record.schoolId];if(!expected)throw new Error('unverified LegitGM school mapping');
 const title=plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]||'');
 const pair=/^(.+?)\s+(\d+),\s+(.+?)\s+(\d+)$/.exec(title);if(!pair)throw new Error('LegitGM final header missing');
 const names=[pair[1],pair[3]],scores=[Number(pair[2]),Number(pair[4])],side=names.findIndex(n=>key(n)===key(expected.name));
 if(side<0||key(names[1-side])!==key(record.opponent)||scores[0]===scores[1])throw new Error('LegitGM matchup mismatch');
 const text=plain(html),date=/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(20\d\d)\b/.exec(text);
 const month=date&&['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(date[1])+1;
 if(!date||`${date[3]}-${String(month).padStart(2,'0')}-${date[2].padStart(2,'0')}`!==record.date)throw new Error('LegitGM date/season mismatch');
 if(record.state==='post'&&(record.schoolScore!==scores[side]||record.opponentScore!==scores[1-side]))throw new Error('LegitGM final score conflict');
 const tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].slice(0,2);if(tables.length!==2)throw new Error('LegitGM box tables missing');
 const players=[];
 for(let team=0;team<2;team++){
  const rows=[...tables[team][1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>cells(m[1])),headers=rows.shift();
  const p=Object.fromEntries(headers.map((h,i)=>[h,i]));if(p.Player==null||p.PTS==null)throw new Error('LegitGM columns missing');
  const total=rows.find(r=>/^Team totals$/i.test(r[p.Player]));const athletes=rows.filter(r=>!/^Team totals$/i.test(r[p.Player]));
  if(!total||Number(total[p.PTS])!==scores[team]||athletes.some(r=>!/^\d+$/.test(r[p.PTS]))||athletes.reduce((n,r)=>n+Number(r[p.PTS]),0)!==scores[team])throw new Error('LegitGM player/team totals disagree');
  if(team!==side)continue;
  for(const member of HIGH_SCHOOL_PLAYERS.filter(m=>m.schoolId===record.schoolId)){
   const matching=athletes.filter(r=>[member.englishName,...(member.aliases||[])].some(n=>key(n)===key(r[p.Player].replace(/^#\d+\s*/,''))));
   if(matching.length>1)throw new Error('ambiguous LegitGM player');if(!matching.length)continue;
   const r=matching[0],stats={};
   for(const name of ['MIN','PTS','REB','AST','STL','BLK','TO','PF','FG','3PT','FT']){
    const value=r[p[name]];if(value==null||value===''||value==='-')continue;
    if(name==='MIN'&&!/^(?:\d{1,2}(?:\.[0-9])?|\d{1,2}:[0-5]\d|<1)$/.test(value))continue;
    stats[name]=value;
   }
   if(stats.FG&&stats['3PT']&&stats.FT&&2*Number(stats.FG.split('-')[0])+Number(stats['3PT'].split('-')[0])+Number(stats.FT.split('-')[0])!==Number(stats.PTS))throw new Error('LegitGM player shooting disagrees');
   players.push({playerId:member.id,stats});
  }
 }
 return {...record,bootstrap:false,state:'post',schoolScore:scores[side],opponentScore:scores[1-side],players,sourceUrl};
}
module.exports={MAXPREPS,LEGIT_TEAMS,parseMaxPreps,parseLegitBox,mergeSchedules,plain};
