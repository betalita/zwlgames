'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {normalizeRecord}=require('./high-school-lib/high-school-records');
const primary='https://www.instagram.com/p/Dfuxw3_Jftf/';
const media='https://news.zhibo8.com/nba/2026-11-15/6af90ea67768cnative.htm';
const paragraph='直播吧11月15日讯 美高赛事，Notre Dame Prep以73-72险胜One Way Academy，中国小将张子一贡献绝杀，全场砍下28分。';
const corrected={id:'neprep-9808148',sourceNativeId:'neprep-9808148',schoolId:'notre-dame-prep-ny',season:2027,date:'2026-11-14',localTime:'10:00',timeZone:'America/New_York',opponent:'One Way Basketball Institute (FL)',venue:'neutral',location:'Boo Williams',sourceUrl:primary,state:'post',schoolScore:73,opponentScore:72,players:[{playerId:'zhangziyi',stats:{PTS:'28'},statSources:{PTS:media}}],evidence:{kind:'media-report',sourceUrl:media,title:'张子一绝杀砍下28分',publishedAt:'2026-11-15T01:55:20.000Z',paragraphs:[paragraph],bodyHash:createHash('sha256').update(paragraph).digest('hex')}};
test('reviewed joint league/team result preserves game identity and reports only sourced points',()=>{
 const result=normalizeRecord(corrected);assert.equal(result.eventId,'official-hs-b8711ca9d4d55f5e11cc09d847373268');assert.equal(result.home.score,'73');assert.equal(result.away.score,'72');assert.equal(result.sourceUrl,primary);assert.deepEqual(result.players[0].stats,{PTS:'28'});assert.equal(result.players[0].statSources.PTS,media);
});
test('reviewed primary post is restricted to its exact fixture and final, not the Instagram domain',()=>{
 for(const patch of [{id:'another-game'},{date:'2026-11-13'},{opponent:'Another Academy'},{schoolScore:74},{opponentScore:71},{sourceUrl:primary+'?other=1'},{sourceUrl:primary.replace('Dfuxw3_Jftf','OtherPost')},{schoolId:'phelps-national'}])assert.throws(()=>normalizeRecord({...corrected,...patch}),/source|reviewed/i);
});
test('the score-only joint post cannot stand in for evidence of personal statistics on any fixture',()=>{
 const unsupported={...corrected,evidence:undefined,players:[{playerId:'zhangziyi',stats:{PTS:'29',REB:'10'}}]};
 assert.throws(()=>normalizeRecord(unsupported),/statistic|evidence|source/i);
});
test('the score-only joint post cannot label statistics in a different fixture',()=>{
 const other={...corrected,evidence:undefined,id:'other-fixture',date:'2026-11-15',sourceUrl:'https://www.neprepbasketball.net/team/272487/games',players:[{playerId:'zhangziyi',stats:{PTS:'29'},statSources:{PTS:primary}}]};
 assert.throws(()=>normalizeRecord(other),/statistic|evidence|source/i);
});
