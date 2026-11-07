'use strict';
const KEYS=['MIN','FG','3PT','FT','OREB','DREB','REB','AST','STL','BLK','TO','PF','PTS'];
const HEAD=['Player','MIN','FGM-A','3PM-A','FTM-A','OREB','DREB','REB','AST','STL','BLK','TO','PF','PTS'];
const LABELS={FG:'投篮', '3PT':'三分',FT:'罚球',OREB:'进攻篮板',DREB:'防守篮板',REB:'篮板',AST:'助攻',STL:'抢断',BLK:'盖帽',TO:'失误',PF:'犯规',PTS:'得分',FG_PCT:'投篮命中率',THREE_PCT:'三分命中率',FT_PCT:'罚球命中率',OFF_TO:'利用失误得分',SECOND:'二次进攻得分',PAINT:'内线得分',FAST:'快攻得分',BENCH:'替补得分',LEAD:'最大领先'};
const plain=s=>String(s).replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#0?39;|&apos;/g,"'").replace(/\s+/g,' ').trim();
const norm=s=>plain(s).toLowerCase().replace(/\b(university|community|college)\b/g,'').replace(/[^a-z0-9]/g,'');
function matchHeading(html,seed){
 return [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>plain(m[1]))
  .find(h=>norm(h).includes('floridasouthwestern')&&norm(h).includes(norm(seed.opponent)))||'';
}
const rows=s=>[...s.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plain(c[1])));
function cleanStats(values,score,team=false){
 const stats=values.map((v,i)=>{
  if(i===0)return /^([0-5]?\d)(:[0-5]\d)?$/.test(v)&&v!=='0'&&v!=='0:00'?v:null;
  if(i>=1&&i<=3){const m=String(v).match(/^(\d{1,3})-(\d{1,3})$/);return m&&+m[1]<=+m[2]&&+m[2]<=150?v:null;}
  return /^\d{1,3}$/.test(v)&&+v<= (KEYS[i]==='PTS'?score:KEYS[i]==='PF'?(team?300:5):150)?v:null;
 });
 const shots=i=>stats[i]?.split('-').map(Number);
 if(shots(1)&&shots(2)&&(shots(2)[0]>shots(1)[0]||shots(2)[1]>shots(1)[1])){stats[1]=null;stats[2]=null;}
 if(shots(1)&&shots(2)&&shots(3)&&stats[12]!==null&&shots(1)[0]*2+shots(2)[0]+shots(3)[0]!==+stats[12])for(const i of [1,2,3,12])stats[i]=null;
 if([4,5,6].every(i=>stats[i]!==null)&&+stats[4]+ +stats[5]!==+stats[6])for(const i of [4,5,6])stats[i]=null;
 return stats;
}
function parseDetails(html,seed,result,teamHtml=''){
 const identity=s=>!!matchHeading(s,seed);
 if(!identity(html))return {};
 // Modern Presto pages embed half/period tables with the same team captions.
 // Only the full-game panel may supply player totals; older pages have no panel.
 const fullGame=html.match(/<section\b[^>]*\bid=["']boxscore-tabpanel["'][^>]*>([\s\S]*?)<\/section>/i)?.[1]??html;
 const tables=[...fullGame.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m=>({name:plain(m[0].match(/<caption\b[^>]*>([\s\S]*?)<\/caption>/i)?.[1]||''),rows:rows(m[0])}));
 const details={};const totals={};
 for(const role of ['school','opponent']){
  const choices=tables.filter(t=>role==='school'?norm(t.name)==='floridasouthwesternstate':norm(t.name)===norm(seed.opponent));
  if(choices.length!==1)continue;const table=choices[0];
  if(JSON.stringify(table.rows[0])!==JSON.stringify(HEAD))continue;
  const score=result[role==='school'?'schoolScore':'opponentScore'];let group='球员';const groups=[];const seen=new Set();
  const playerRows=table.rows.filter(r=>r.length===14&&/^\d+\s+/.test(r[0]));
  const placeholder=playerRows.length>=4&&playerRows.every(r=>r[1]==='1');
  for(const row of table.rows.slice(1)){
   if(row[0]==='STARTERS'){group='starters';continue;}if(row[0]==='RESERVES'){group='bench';continue;}
   if(row.length!==14&&!row.some(v=>/^(?:DNP|Did Not Play)$/i.test(v)))continue;
   if(row[0]==='TOTALS'){totals[role]=cleanStats(row.slice(1),score,true);continue;}
   const m=row[0].match(/^(\d{1,3})\s+(.+)$/);if(!m)continue;
   const name=m[2];const id=role==='school'&&/^Weilun\s+Zhao$/i.test(name)?'zhaoweilun':`${role}-${norm(name)}-${m[1]}`;
   if(seen.has(id))continue;seen.add(id);
   const dnp=row.slice(1).some(v=>/^(?:DNP|Did Not Play)$/i.test(v));
   const stats=dnp?KEYS.map(()=>null):cleanStats(row.slice(1),score);if(placeholder)stats[0]=null;
   if(!dnp&&stats.every(v=>v===null))continue;
   let target=groups.find(g=>g.name===group);if(!target){target={name:group,labels:KEYS,athletes:[]};groups.push(target);}
   target.athletes.push({id,name,jersey:m[1],didNotPlay:dnp,stats});
  }
  if(groups.find(g=>g.name==='starters')?.athletes.length!==5){const athletes=groups.flatMap(g=>g.athletes);groups.splice(0,groups.length,...(athletes.length?[{name:'球员',labels:KEYS,athletes}]:[]));}
  const statistics=[];const athletes=groups.flatMap(g=>g.athletes).filter(a=>!a.didNotPlay);
  if(athletes.length&&athletes.every(a=>a.stats[12]!==null)&&athletes.reduce((sum,a)=>sum+ +a.stats[12],0)!==score){
   for(const a of athletes)for(const i of [1,2,3,12])a.stats[i]=null;
  }
  const teamRow=table.rows.find(r=>/^TM\s+TEAM$/i.test(r[0]));
  if(totals[role])for(let i=1;i<KEYS.length;i++){
   let value=totals[role][i];if(value===null||!athletes.length||athletes.some(a=>a.stats[i]===null))continue;
   const sum=part=>athletes.reduce((a,p)=>a+Number(part===undefined?p.stats[i]:p.stats[i].split('-')[part]),0);
   if(i<=3){const [made,attempts]=value.split('-').map(Number);if(sum(0)!==made||sum(1)!==attempts)continue;}
   else if(sum()+(Number(teamRow?.[i+1])||0)!==+value)continue;
   statistics.push({name:KEYS[i],label:LABELS[KEYS[i]],value});
  }
  if(groups.length||statistics.length)details[role]={groups,statistics};
 }
 // A steal requires an opponent turnover; free throws with zero recorded team fouls indicate incomplete fouls.
 for(const role of ['school','opponent']){
  const other=role==='school'?'opponent':'school';if(!details[role]||!totals[role]||!totals[other])continue;
  const bad=[];
  if(totals[role][10]!==null&&totals[other][8]!==null&&+totals[role][10]<+totals[other][8])bad.push('TO');
  if(totals[role][11]==='0'&&Number(totals[other][3]?.split('-')[1])>0)bad.push('PF');
  for(const key of bad){for(const g of details[role].groups)for(const a of g.athletes)a.stats[KEYS.indexOf(key)]=null;details[role].statistics=details[role].statistics.filter(s=>s.name!==key);}
 }
 const heading=s=>matchHeading(s,seed);
 if(teamHtml&&identity(teamHtml)&&heading(teamHtml)===heading(html)){
  const comparison=[...teamHtml.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m=>rows(m[0])).find(t=>t[0]?.length===3&&t[0][0]==='Stat'&&t[0].some(n=>norm(n).includes('floridasouthwestern'))&&t[0].some(n=>norm(n)===norm(seed.opponent)));
  const extra={'Field Goal %':['FG_PCT','FG'],'3 Point %':['THREE_PCT','3PT'],'Free Throw %':['FT_PCT','FT'],'Points off Turnovers':['OFF_TO'],'2nd Chance Points':['SECOND'],'Points in the Paint':['PAINT'],'Fastbreak Points':['FAST'],'Bench Points':['BENCH'],'Largest Lead':['LEAD']};
  if(comparison)for(const role of ['school','opponent']){
   if(!details[role])continue;const column=comparison[0].findIndex(n=>role==='school'?norm(n)==='floridasouthwesternstate':norm(n)===norm(seed.opponent));if(column<1)continue;
   for(const row of comparison.slice(1)){const field=extra[row[0]];if(!field)continue;const [key,shot]=field;const value=row[column];
    if(shot){const verified=details[role].statistics.find(s=>s.name===shot)?.value.split('-').map(Number);if(!verified||!/^\d{1,3}(?:\.\d)?%$/.test(value)||!verified[1]||Math.abs(parseFloat(value)-verified[0]/verified[1]*100)>.11)continue;}
    else if(!/^\d{1,3}$/.test(value)||+value>result[role==='school'?'schoolScore':'opponentScore'])continue;
    details[role].statistics.push({name:key,label:LABELS[key],value});
   }
  }
 }
 return details;
}
module.exports={parseDetails,matchHeading,KEYS,LABELS};
