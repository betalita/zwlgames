'use strict';
const {createHash}=require('node:crypto');
const {SCHOOLS,HIGH_SCHOOL_PLAYERS,SEASON}=require('./high-school-roster');
const EXTRA_SCHOOLS={'bella-vista':['贝拉维斯塔预科学院','CIA Bella Vista'],'notre-dame-prep-ny':['Notre Dame Prep']};
const HUPU_SCHOOLS={'bella-vista':['Bella Vista'],'veritas-national':['Veritas Academy'],
 'wasatch-national':['Wasatch Academy','瓦萨奇学院']};
// Aliases are reviewed against registered fixtures and the corresponding reports.
const OPPONENT_ALIASES={'Elite Sports Academy':['精英体育学院'],'One Way Basketball Institute (FL)':['One Way Academy']};
const decoded=value=>String(value||'').normalize('NFKC');
const HUPU_AUTHORS=Object.freeze({'56098302':['24','5073']});
const isHupuUrl=value=>/^https:\/\/bbs\.hupu\.com\/[1-9]\d{6,10}\.html$/.test(value);
function isMediaUrl(value){
 if(isHupuUrl(value))return true;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash&&
  (u.hostname==='news.zhibo8.com'&&/^\/(?:nba|cba|basketball)\/20\d\d-\d\d-\d\d\/[\w-]+\.htm$/.test(u.pathname)||
   u.hostname==='m.zhibo8.com'&&/^\/news\/web\/(?:nba|cba|basketball)\/20\d\d-\d\d-\d\d\/[\w-]+\.htm$/.test(u.pathname));
 }catch{return false;}
}
function schoolNames(schoolId){
 return [SCHOOLS[schoolId]?.name,SCHOOLS[schoolId]?.nameZh,...(EXTRA_SCHOOLS[schoolId]||[])].filter(Boolean);
}
const hupuNames=schoolId=>[...schoolNames(schoolId),...(HUPU_SCHOOLS[schoolId]||[])];
function aliases(record){
 return schoolNames(record.schoolId);
}
function contains(text,name){
 if(!name)return false;
 text=decoded(text);name=decoded(name);
 if(/^[\x00-\x7f]+$/.test(name)){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\s+/g,'\\s+');
  return new RegExp('(?:^|[^a-z0-9])'+escaped+'(?:$|[^a-z0-9])','i').test(text);
 }
 return text.includes(name);
}
function validEvidence(e){
 if(!e||!isMediaUrl(e.sourceUrl)||!Array.isArray(e.paragraphs)||!e.paragraphs.length||e.paragraphs.length>12||
  e.paragraphs.some(p=>typeof p!=='string'||p.length>1000)||typeof e.title!=='string'||e.title.length>500||
  e.paragraphs.join('\n').length>4000)return false;
 const hash=createHash('sha256').update(e.paragraphs.join('\n')).digest('hex');
 const at=Date.parse(e.publishedAt||'');
 if(!Number.isFinite(at)||e.bodyHash!==hash)return false;
 if(isHupuUrl(e.sourceUrl))return Object.hasOwn(HUPU_AUTHORS,e.publisher)&&HUPU_AUTHORS[e.publisher].includes(e.board);
 return e.sourceUrl.includes(new Date(at+8*3600000).toISOString().slice(0,10));
}
const exactName=(value,names)=>names.some(name=>decoded(name).toLowerCase()===decoded(value).trim().toLowerCase());

function hupuScore(e,record){
 const day=new Date(Date.parse(e.publishedAt)+8*3600000).toISOString().slice(0,10);
 const opponent=[record.opponent,...hupuNames(record.opponentSchoolId),...(OPPONENT_ALIASES[record.opponent]||[])];
 const found=[];
 let scoreLines=0;
 for(const paragraph of e.paragraphs){
  const match=/^虎扑(\d{1,2})月(\d{1,2})日讯\s+(?:EYBL(?: Scholastic)?(?:联赛)?|美高(?:篮球|赛事)?):\s*(.+?)\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\s*(.+?)[。.]?$/.exec(decoded(paragraph));
  if(!match||Number(match[1])!==Number(day.slice(5,7))||Number(match[2])!==Number(day.slice(8)))continue;
  scoreLines++;
  const [, , , first,a,b,second]=match;
  if(a===b||Number(a)>250||Number(b)>250)continue;
  if(exactName(first,hupuNames(record.schoolId))&&exactName(second,opponent))found.push([Number(a),Number(b)]);
  if(exactName(first,opponent)&&exactName(second,hupuNames(record.schoolId)))found.push([Number(b),Number(a)]);
 }
 return {score:found.length===1?found[0]:null,scoreLines};
}

function hupuPlayerStats(e,member,score,allowUnnamedTeam){
 if(!contains(e.title,member.name))return null;
 const matching=[];
 for(const paragraph of e.paragraphs){
  const text=decoded(paragraph).trim();
  const subject=/^(?:本场比赛,\s*)?(?:中国(?:球员|小将))?\s*/.exec(text)[0];
  const rest=text.slice(subject.length);
  if(!rest.startsWith(member.name))continue;
  const body=rest.slice(member.name.length);
  const team=/^\s*\(([^()]+)\)/.exec(body);
  if(team?!exactName(team[1],hupuNames(member.schoolId)):!allowUnnamedTeam)continue;
  const metrics=body.slice(team?.[0].length||0).trim().replace(/[。.]$/,'');
  const values={};
  const labels={'分':'PTS','篮板':'REB','助攻':'AST','抢断':'STL','盖帽':'BLK','失误':'TO','犯规':'PF'};
  let valid=true;
  for(const clause of metrics.split(',').map(value=>value.trim())){
   let match=/^(?:首发|替补)?(?:出场|出战|登场)\s*(\d{1,2}(?:\.\d)?)\s*分钟$/.exec(clause);
   if(match&&values.MIN==null){values.MIN=match[1];continue;}
   match=/^(?:(全场|投篮|三分|罚球)\s*)?(\d{1,3})\s*(?:(?:投|罚)\s*(\d{1,3})\s*中|中\s*(\d{1,3}))$/.exec(clause);
   if(match){const label=match[1]==='三分'?'3PT':match[1]==='罚球'?'FT':'FG';if(values[label]==null){values[label]=(match[3]||match[4])+'-'+match[2];continue;}}
   const summary=clause.replace(/^(?:得到|贡献|拿下|砍下)\s*/,'');
   const fields=[...summary.matchAll(/(\d{1,3})\s*(?:次|个)?\s*(分|篮板|助攻|抢断|盖帽|失误|犯规)/g)];
   if(fields.length&&fields.map(field=>field[0]).join('')===summary&&fields.every(field=>values[labels[field[2]]]==null)&&
     new Set(fields.map(field=>field[2])).size===fields.length){
    for(const [,value,label] of fields)values[labels[label]]=value;
    continue;
   }
   valid=false;break;
  }
  if(valid&&(values.PTS!=null||values.MIN!=null&&Object.keys(values).length>1))matching.push(values);
 }
 if(matching.length!==1)return null;
 try{return require('./high-school-records').statsMap(matching[0],score);}catch{return null;}
}
function scoreIn(e,record){
 const school=aliases(record),opponent=[record.opponent,...(OPPONENT_ALIASES[record.opponent]||[])];
 const found=[];
 for(const raw of e.paragraphs){
  const text=decoded(raw);
  if(/回顾|上一场|上轮|此前|曾经|去年|去年同期|上赛季|明日|明天|将于|预告|预测|预计|有望|如果|假如|模拟|半场|首节|第一节|第二节|第三节|前三节|截至|暂时|进行中/.test(text))continue;
  if(record.schoolId==='bella-vista'&&/BV Academy|BV Open|BV Power|Bella Vista (?:National|Open|Power)|女子|女队/i.test(text))continue;
  for(const m of text.matchAll(/(\d{1,3})\s*[-:–]\s*(\d{1,3})\s*(战胜|击败|险胜|不敌|负于|输给)/g)){
   const before=text.slice(0,m.index).split(/[，,。;；!！]/).at(-1).trim().replace(/^(?:最终|本场|此役)\s*/,'').replace(/以\s*$/,'').trim();
   const after=text.slice(m.index+m[0].length).split(/[，,。;；!！]/)[0].trim();
   const exact=(text,names)=>names.some(n=>decoded(text).toLowerCase()===decoded(n).toLowerCase());
   const a=Number(m[1]),b=Number(m[2]);
   if(a===b||a>250||b>250||((/战胜|击败|险胜/.test(m[3]))!==(a>b)))continue;
   if(exact(before,school)&&exact(after,opponent))found.push([a,b]);
   if(exact(before,opponent)&&exact(after,school))found.push([b,a]);
  }
 }
 if(found.length!==1)return null;
 return found[0];
}
function playerStats(e,member,record,score){
 if(![member.name,member.englishName,...(member.aliases||[])].some(n=>contains(e.title,n)))return null;
 const paragraphs=e.paragraphs.filter(p=>contains(p,member.name)&&aliases(record).some(n=>contains(p,n)));
 if(paragraphs.length!==1)return null;
 const text=decoded(paragraphs[0]);
 if(/上一场|上轮|此前|场均|上赛季|明日|预计|队友|另外|此外|另有|其他球员|其余球员|全队|对手|分别/.test(text)||HIGH_SCHOOL_PLAYERS.some(p=>p.id!==member.id&&contains(text,p.name)))return null;
 const nameAt=text.indexOf(member.name),prefix=text.slice(0,nameAt);
 const schoolName=aliases(record).map(decoded).find(n=>prefix.startsWith(n));
 const subject=/^(?:的|中国|旅美|小将|球员|后卫|前锋|中锋)*$/;
 if(!(schoolName&&subject.test(prefix.slice(schoolName.length)))){
  // A scoreboard clause can establish the school, but the following clause
  // must explicitly name this player without introducing another subject.
  const clause=prefix.split(/[，,。;；!！]/).at(-1).trim();
  if(!subject.test(clause)||!scoreIn({paragraphs:[prefix]},record))return null;
 }
 const suffix=text.slice(nameAt+member.name.length);
 // Statistical clauses must retain this player's subject. Unknown subjects,
 // including untracked teammates, cannot inherit the preceding player's name.
 for(const clause of suffix.split(/[，,。;；!！]/).map(s=>s.trim()).filter(Boolean)){
  const grammar=/^(?:(?:替补|首发|出场|登场|出战|上场|全场|投篮|得到|拿下|贡献|获得|砍下|最终|命中率|命中|三分|罚球|分钟|篮板|助攻|抢断|盖帽|失误|犯规|投|中|分|板|罚|次|个)|\d+(?:\.\d+)?|\s|[-+%/])+$/;
  if(!grammar.test(clause)&&!new Set(['攻防两端均有发挥','表现出色','发挥出色','效率出色','表现稳定','发挥稳定','贡献绝杀']).has(clause))return null;
 }
 const stats={};
 const patterns={MIN:/(\d{1,2}(?:\.\d)?)\s*分钟/,PTS:/(\d{1,3})\s*分(?!钟)/,REB:/(\d{1,3})\s*(?:个)?篮板/,AST:/(\d{1,3})\s*(?:次)?助攻/,STL:/(\d{1,3})\s*(?:次)?抢断/,BLK:/(\d{1,3})\s*(?:次)?盖帽/,TO:/(\d{1,3})\s*(?:次)?失误/,PF:/(\d{1,3})\s*(?:次)?犯规/};
 for(const [key,re]of Object.entries(patterns)){const matches=[...suffix.matchAll(new RegExp('(?<![\\d.])'+re.source,'g'))];if(matches.length>1)return null;if(matches[0])stats[key]=matches[0][1];}
 const fg=/(?:全场|投篮)\s*(\d{1,3})\s*投\s*(\d{1,3})\s*中/.exec(suffix);
 if(fg)stats.FG=`${fg[2]}-${fg[1]}`;
 for(const [label,re]of [['3PT',/三分\s*(\d{1,3})\s*投\s*(\d{1,3})\s*中/],['FT',/罚球\s*(\d{1,3})\s*罚\s*(\d{1,3})\s*中/]]){
  const m=re.exec(suffix);if(m)stats[label]=`${m[2]}-${m[1]}`;
 }
 if(stats.PTS==null)return null;
 try{return require('./high-school-records').statsMap(stats,score);}catch{return null;}
}
function matchRecord(e,record){
 if(record.season!==SEASON||!SCHOOLS[record.schoolId]||record.scheduleStatus)return null;
 const {gameTime}=require('./high-school-records');let time;try{time=gameTime(record);}catch{return null;}
 const published=Date.parse(e.publishedAt),start=Date.parse(time.startsAt.replace(' ','T')+'Z');
 const chinaDay=new Date(published+8*3600000).toISOString().slice(0,10);
 const localDates=[...e.paragraphs.join(' ').matchAll(/(?:美国)?当地时间\s*(?:(20\d\d)年)?(\d{1,2})月(\d{1,2})日/g)];
 const explicitLocal=localDates.length>0&&localDates.every(m=>(!m[1]||m[1]===record.date.slice(0,4))&&Number(m[2])===Number(record.date.slice(5,7))&&Number(m[3])===Number(record.date.slice(8,10)));
 if(localDates.length&&!explicitLocal)return null;
 const nextDay=new Date(Date.parse(time.dateKey+'T00:00:00Z')+86400000).toISOString().slice(0,10);
 const nearbyDay=chinaDay===time.dateKey||chinaDay===nextDay&&published-start<=36*3600000;
 if(time.timeKnown ? published<start||published>start+73*3600000||!nearbyDay&&!explicitLocal : !explicitLocal)return null;
 const hupu=isHupuUrl(e.sourceUrl);
 const reported=hupu?hupuScore(e,record):{score:scoreIn(e,record)};
 const {score}=reported;if(!score)return null;
 const members=HIGH_SCHOOL_PLAYERS.filter(p=>p.schoolId===record.schoolId||hupu&&p.schoolId===record.opponentSchoolId);
 const candidates=members.map(member=>({member,stats:hupu?
  hupuPlayerStats(e,member,score[member.schoolId===record.schoolId?0:1],members.length===1&&reported.scoreLines===1):
  playerStats(e,member,record,score[0])})).filter(p=>p.stats);
 if(!candidates.length)return null;
 const players=candidates.map(({member,stats})=>({playerId:member.id,stats,statSources:Object.fromEntries(Object.keys(stats).map(k=>[k,e.sourceUrl]))}));
 return {...record,bootstrap:false,state:'post',schoolScore:score[0],opponentScore:score[1],players,
  sourceUrl:record.state==='post'?record.sourceUrl:e.sourceUrl,evidence:{...e,kind:'media-report'}};
}
function mergePlayerStats(record,candidate){
 const players=(record.players||[]).map(p=>({...p,stats:p.stats?{...p.stats}:undefined,statSources:p.stats?Object.fromEntries(Object.keys(p.stats).map(k=>[k,p.statSources?.[k]||record.sourceUrl])):undefined}));
 for(const row of candidate.players){
  const prior=players.find(p=>p.playerId===row.playerId);
  if(prior?.dnp||Object.entries(row.stats).some(([k,v])=>prior?.stats?.[k]!=null&&String(prior.stats[k])!==v))return null;
  const sources=Object.fromEntries(Object.keys(row.stats).map(k=>[k,prior?.statSources?.[k]||row.statSources[k]]));
  if(prior){prior.stats={...prior.stats,...row.stats};prior.statSources={...prior.statSources,...sources};}
  else players.push({...row,statSources:sources});
 }
 return {...candidate,players};
}
function inspectMediaResult(e,records,now=null){
 if(!validEvidence(e)||/预告|回顾|上一场|上赛季|明日|明天|场均/.test(e.title)||now&&Date.parse(e.publishedAt)>now.getTime()+300000)return {result:null,reason:'invalid_evidence'};
 const unique=new Map(records.map(r=>[`${r.schoolId}:${r.id}`,r]));
 const matches=[...unique.values()].map(record=>({record,candidate:matchRecord(e,record)})).filter(m=>m.candidate);
 if(matches.length!==1)return {result:null,reason:matches.length?'ambiguous_fixture':'unmatched_report'};
 const {record,candidate}=matches[0];
 if(record.state==='post'&&(record.schoolScore!==candidate.schoolScore||record.opponentScore!==candidate.opponentScore))
  return {result:null,reason:'final_score_conflict',candidate,storedScore:[record.schoolScore,record.opponentScore],reportedScore:[candidate.schoolScore,candidate.opponentScore]};
 // Resolve fixture identity before applying stored-statistic protection. A
 // conflicting prior stat must never disambiguate two possible fixtures.
 const result=mergePlayerStats(record,candidate);
 return {result,reason:result?null:'player_stat_conflict'};
}
function mediaResult(e,records,now=null){return inspectMediaResult(e,records,now).result;}
function validateMediaRecord(record){
 const evidence=record.evidence;
 if(!evidence)return;
 if(evidence.kind!=='media-report')throw Error('invalid media evidence kind');
 const base={...record,state:'pre',players:undefined,sourceUrl:SCHOOLS[record.schoolId]?.url,evidence:undefined};
 const expected=mediaResult(evidence,[base]);
 if(!expected||expected.schoolScore!==record.schoolScore||expected.opponentScore!==record.opponentScore)throw Error('media evidence matchup/final mismatch');
 const primaryHupu=isHupuUrl(record.sourceUrl);
 if(primaryHupu&&record.sourceUrl!==evidence.sourceUrl)throw Error('Hupu evidence must match the article used for the result');
 for(const row of record.players||[]){
  const parsed=expected.players.find(p=>p.playerId===row.playerId);
  if(primaryHupu&&(!parsed||row.dnp||Object.keys(row.stats||{}).some(label=>row.statSources?.[label]!==evidence.sourceUrl)))
   throw Error('Hupu player statistics require matching article provenance');
  for(const [label,url]of Object.entries(row.statSources||{}))if(isMediaUrl(url)&&
   (url!==evidence.sourceUrl||!parsed||String(row.stats?.[label])!==String(parsed.stats?.[label])))throw Error('media evidence statistics mismatch');
 }
 if(isMediaUrl(record.sourceUrl)&&!(record.players||[]).some(p=>p.statSources&&Object.values(p.statSources).includes(record.sourceUrl)))throw Error('media evidence provenance missing');
}
module.exports={mediaResult,inspectMediaResult,isHupuUrl,isMediaUrl,validateMediaRecord,HUPU_AUTHORS};
