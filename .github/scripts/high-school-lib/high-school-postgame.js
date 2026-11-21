'use strict';
const MINUTE=60000,HOUR=60*MINUTE;
const CHECK_MINUTES=[120,140,160,180,240,360,480,720,1440,2880,4320,5760,7200,8640,10080];
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
  // Read sources late on the game date even on the US West Coast. An
  // unknown tipoff can schedule a source check but cannot establish a final.
  const first=Date.parse(game.source_date+'T00:00:00Z')+29*HOUR;
  return {first,end:first+169*HOUR,checks:[0,3,9,15,24,48,72,96,120,144,168].map(hour=>first+hour*HOUR)};
 }
 return {first:start+120*MINUTE,end:start+169*HOUR,checks:CHECK_MINUTES.map(minutes=>start+minutes*MINUTE)};
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
 const last=timestamp(game.last_checked_at);
 if(Number.isFinite(saved)&&saved>=slots.first&&saved<slots.end){
  if(Number.isFinite(last)&&saved>last||!Number.isFinite(last)&&
    (game.time_known===true||saved===slots.first||saved<=current))return new Date(saved);
 }
 if(!Number.isFinite(last))return new Date(Math.max(current,slots.first));
 const next=slots.checks.find(at=>at>last);
 return next==null?null:new Date(Math.max(current,next));
}
function highSchoolCheckpointAt(game,now=new Date()){
 const slots=schedule(game);if(!slots||now.getTime()>=slots.end)return null;
 const last=timestamp(game.last_checked_at);
 const next=Number.isFinite(last)?slots.checks.find(at=>at>last):slots.first;
 return next==null?null:new Date(next);
}
module.exports={CHECK_MINUTES,REQUIRED_STATS,nextHighSchoolSyncAt,recoverHighSchoolDeadline,highSchoolCheckpointAt,highSchoolTiming,timestamp};
