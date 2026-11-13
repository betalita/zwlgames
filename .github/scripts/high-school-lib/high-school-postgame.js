'use strict';
const MINUTE=60000,HOUR=60*MINUTE;
const CHECK_MINUTES=[120,140,160,180,240,360,480,720,1440,2880,4320];
const REQUIRED_STATS=['MIN','PTS','REB','AST','FG','3PT','FT','STL','BLK','TO','PF'];
const decode=value=>typeof value==='string'?JSON.parse(value):value;
const timestamp=value=>value instanceof Date?value.getTime():Date.parse(String(value||'').replace(' ','T').replace(/Z?$/,'Z'));
function highSchoolTiming(game){
 const sides=[decode(game.home_json||game.home||{}),decode(game.away_json||game.away||{})];
 return {time_known:sides.some(t=>t.timeKnown===true),source_date:sides[0]?.sourceDate,
  schedule_status:sides.find(t=>t.scheduleStatus)?.scheduleStatus||null};
}
function complete(players){
 return Array.isArray(players)&&players.length>0&&players.every(p=>{
  if((p.stats_state||p.state)==='dnp')return Boolean(p.reason?.trim());
  if((p.stats_state||p.state)!=='ready')return false;
  const stats=decode(p.stats_json||p.stats||{});
  return REQUIRED_STATS.every(key=>stats[key]!=null&&!['','-','--','—'].includes(String(stats[key])));
 });
}
function schedule(game){
 if(game.schedule_status||game.state==='post'&&complete(game.players))return null;
 const start=timestamp(game.starts_at||game.startsAt);
 if(!Number.isFinite(start))return null;
 if(game.time_known!==true){
  if(!/^\d{4}-\d\d-\d\d$/.test(game.source_date||''))return null;
  const first=Date.parse(game.source_date+'T00:00:00Z')+36*HOUR;
  return {first,end:first+49*HOUR,checks:[0,6,12,24,48].map(hour=>first+hour*HOUR)};
 }
 return {first:start+120*MINUTE,end:start+73*HOUR,checks:CHECK_MINUTES.map(minutes=>start+minutes*MINUTE)};
}
function nextHighSchoolSyncAt(game,now=new Date()){
 const slots=schedule(game),current=now.getTime();
 if(!slots||current>=slots.end)return null;
 const last=timestamp(game.last_checked_at);
 if(!Number.isFinite(last))return new Date(Math.max(current,slots.first));
 // Ignore missed intermediate slots after a delayed run or restart.
 const next=slots.checks.find(at=>at>Math.max(last,current));
 return next==null?null:new Date(next);
}
function recoverHighSchoolDeadline(game,now=new Date()){
 const slots=schedule(game),current=now.getTime();
 if(!slots||current>=slots.end)return null;
 const saved=timestamp(game.next_sync_at);
 if(Number.isFinite(saved)&&saved>=slots.first&&saved<slots.end){
  const last=timestamp(game.last_checked_at);
  if(!Number.isFinite(last)||saved>last)return new Date(saved);
 }
 const last=timestamp(game.last_checked_at);
 if(!Number.isFinite(last))return new Date(Math.max(current,slots.first));
 const next=slots.checks.find(at=>at>last);
 return next==null?null:new Date(Math.max(current,next));
}
module.exports={CHECK_MINUTES,REQUIRED_STATS,nextHighSchoolSyncAt,recoverHighSchoolDeadline,highSchoolTiming,timestamp};
