'use strict';

// The Elmira prep program is team 272487. Other Notre Dame programs and
// Crossbar squads are deliberately outside this adapter.
const ROOT='https://www.neprepbasketball.net/team/272487';
const SEASON=2027;
const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const plain=value=>String(value).replace(/<[^>]*>/g,' ').replace(/&nbsp;/gi,' ')
 .replace(/&amp;/gi,'&').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
const key=(date,opponent)=>date+':'+opponent.toLowerCase();
function dateOf(text){
 const m=/\b([A-Za-z]{3})[a-z]*\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/i.exec(text);
 if(!m)return null;const month=months.indexOf(m[1].toLowerCase())+1;
 if(!month)return null;
 return `${m[3]||(month>=7?SEASON-1:SEASON)}-${String(month).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
}
function verifyTeam(html,title,id){
 const heading=plain(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1]||'');
 if(heading!==title||!html.includes('href="/team/'+id+'"')||!/>\s*2026-2027\s*</.test(html))
  throw new Error('NEPrep team/season not verified');
}
function readGameCards(html){
 const cards=[];
 for(const box of html.split(/<div\b[^>]*class="box"[^>]*>/i).slice(1)){
  const heads=[...box.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map(m=>plain(m[1]));
  const opponent=plain(box.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i)?.[1]||'').replace(/^(?:vs\.|@)\s*/i,'');
  const date=dateOf(heads.join(' '));
  if(!date||!opponent)continue;
  cards.push({date,opponent,final:/<p\b[^>]*>\s*Final\s*<\/p>/i.test(box),
   score:plain(box.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1]||'')});
 }
 return cards;
}
function verify(html){verifyTeam(html,'Notre Dame Prep (NY)',272487);}
function parseNotreDame(scheduleHtml,gamesHtml){
 verify(scheduleHtml);verify(gamesHtml);
 const games=[];
 for(const row of scheduleHtml.match(/<tr\b[^>]*\beid="\d+"[^>]*>[\s\S]*?<\/tr>/gi)||[]){
  const c=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>plain(m[1]));
  if(c.length!==7||c[4]!=='Game')continue;
  const date=dateOf(c[1]),opponent=c[6].replace(/^(?:vs\.|@)\s*/i,'');
  if(!date||date<'2026-07-01'||date>'2027-06-30'||!/^(?:vs\.|@)\s/.test(c[6]))
   throw new Error('NEPrep schedule row invalid');
  if(/^(?:TBA|TBD)$/i.test(opponent)||!opponent)continue;
  const native='neprep-'+row.match(/\beid="(\d+)"/)[1];
  const t=/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/.exec(c[2]);
  // Crossbar 1:11 AM is a placeholder. Venue names below have been verified
  // in this team's public map links; never use Elmira's zone for unknown travel.
  const eastern=/^(?:Notre Dame|Boo Williams|Mercersburg|Dana Barros|Perkiomen|Redemption Chr|St Francis)$/i.test(c[5]);
  const time=t&&c[2]!=='1:11 AM'&&eastern?
   `${String(Number(t[1])%12+(t[3]==='PM'?12:0)).padStart(2,'0')}:${t[2]}`:undefined;
  const opponentCourt={Blair:/^Blair Academy\b/, 'Vermont Acad':/^Vermont Academy$/,
   Mercersburg:/^Mercersburg Academy\b/,Perkiomen:/^Perkiomen School National\b/,
   'Redemption Chr':/^Redemption Christian\b/,'Albany Academy':/^Albany Academy\b/,
   WRA:/^Western Reserve Academy\b/}[c[5]];
  const venue=!c[5]||/^(?:TBD|TBA)$/i.test(c[5])?'unknown':c[5]==='Notre Dame'?'home':
   c[6].startsWith('@')&&opponentCourt?.test(opponent)?'away':'neutral';
  games.push({id:native,sourceNativeId:native,schoolId:'notre-dame-prep-ny',season:SEASON,date,
   opponent,location:c[5],venue,
   timeZone:'America/New_York',...(time?{localTime:time}:{}),state:'pre',sourceUrl:ROOT+'/schedule'});
 }
 if(!games.length||new Set(games.map(g=>g.id)).size!==games.length)throw new Error('NEPrep schedule missing or duplicate IDs');
 // Non-final cards only prove source coverage; they do not need a unique
 // fixture assignment. Count each date/opponent group so repeated future
 // matchups cannot block unrelated Finals, while truncated pages still fail.
 const matchups=new Map(),seen=new Map(),finals=new Map();let cards=0;
 for(const game of games){
  const k=key(game.date,game.opponent);
  if(!matchups.has(k))matchups.set(k,[]);
  matchups.get(k).push(game);
 }
 for(const card of readGameCards(gamesHtml)){
  const {date,opponent}=card;cards++;
  if(/^(?:TBA|TBD)$/i.test(opponent))continue;
  const k=key(date,opponent),match=matchups.get(k)||[];
  const count=(seen.get(k)||0)+1;
  if(!match.length||count>match.length)throw new Error('NEPrep results matchup ambiguous');
  seen.set(k,count);
  if(!card.final)continue;
  // Never assign a Final to one of several native fixtures by card order.
  if(match.length!==1)throw new Error('NEPrep results matchup ambiguous');
  const m=/^(\d{1,3})\s*[-–]\s*(\d{1,3})\s*\(([WL])\)$/.exec(card.score);
  if(!m||Number(m[1])===Number(m[2])||(m[3]==='W')!==(Number(m[1])>Number(m[2])))
   throw new Error('NEPrep final disagrees with win/loss');
  finals.set(match[0].id,{state:'post',schoolScore:Number(m[1]),opponentScore:Number(m[2]),sourceUrl:ROOT+'/games'});
 }
 if(!cards||[...matchups].some(([k,rows])=>seen.get(k)!==rows.length))throw new Error('NEPrep results page incomplete');
 return games.map(g=>({...g,...finals.get(g.id)}));
}
async function collectNotreDame(read,report){
 const schedule=await read(ROOT+'/schedule'),results=await read(ROOT+'/games');
 const records=parseNotreDame(schedule,results);
 report('neprep','ok','exact Elmira prep squad; explicit Finals only',records.length);
 return records;
}
module.exports={parseNotreDame,collectNotreDame,readGameCards,verifyTeam};
