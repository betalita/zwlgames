'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {mediaResult,isMediaUrl}=require('./high-school-lib/high-school-media-evidence');
const {HIGH_SCHOOL_PLAYERS,SCHOOLS}=require('./high-school-lib/high-school-roster');
const {normalizeRecord}=require('./high-school-lib/high-school-records');
const url='https://news.zhibo8.com/nba/2026-11-13/6af68b22f283f.htm';
const fixture=(member=HIGH_SCHOOL_PLAYERS[0])=>({id:'game-'+member.id,schoolId:member.schoolId,season:2027,date:'2026-11-12',localTime:'19:00',timeZone:'America/Phoenix',opponent:'Elite Sports Academy',venue:'unknown',sourceUrl:SCHOOLS[member.schoolId].url,state:'pre'});
function article(member=HIGH_SCHOOL_PLAYERS[0],patch={}){
 const paragraphs=[`美高热身赛，${SCHOOLS[member.schoolId].nameZh}以78-58战胜Elite Sports Academy。`,`${SCHOOLS[member.schoolId].nameZh}的${member.name}替补登场15分钟，全场3投2中，拿下6分3篮板2助攻1抢断。`];
 const e={sourceUrl:url,publishedAt:'2026-11-13T04:12:58.000Z',title:`${member.name}拿下6分3篮板`,paragraphs,...patch};
 return {...e,bodyHash:createHash('sha256').update(e.paragraphs.join('\n')).digest('hex')};
}
test('strict media evidence works for all nine registered players and preserves their game identity',()=>{
 for(const member of HIGH_SCHOOL_PLAYERS){const input=fixture(member);const result=mediaResult(article(member),[input]);assert.ok(result,member.name);assert.equal(result.id,input.id);assert.equal(result.schoolScore,78);assert.equal(result.players[0].playerId,member.id);assert.deepEqual(result.players[0].stats,{MIN:'15',PTS:'6',REB:'3',AST:'2',STL:'1',FG:'2-3'});assert.equal(normalizeRecord(result).players[0].stats.PTS,'6');}
});
test('rejects preview, recap, wrong school/opponent/day, future publication, incomplete identity and same-day ambiguity',()=>{
 const input=fixture();
 for(const e of [article(undefined,{title:'张宇辰明日比赛预告'}),article(undefined,{paragraphs:['回顾上一场，贝拉维斯塔预备高中以78-58战胜Elite Sports Academy。','张宇辰得到6分。']}),article(undefined,{paragraphs:['Wrong School以78-58战胜Elite Sports Academy。','张宇辰得到6分。']}),article(undefined,{publishedAt:'2026-11-12T04:12:58.000Z'}),article(undefined,{paragraphs:['贝拉维斯塔预备高中以78-58战胜Wrong Opponent。','张宇辰得到6分。']}),article(undefined,{paragraphs:['半场，贝拉维斯塔预备高中以78-58战胜Elite Sports Academy。','贝拉维斯塔预备高中的张宇辰得到6分。']}),article(undefined,{paragraphs:['预测贝拉维斯塔预备高中以78-58战胜Elite Sports Academy。','贝拉维斯塔预备高中的张宇辰得到6分。']})])assert.equal(mediaResult(e,[input]),null);
 assert.equal(mediaResult(article(),[input,{...input,id:'same-day-doubleheader'}]),null);
 assert.equal(mediaResult(article(),[{...input,localTime:undefined}]),null);
 assert.equal(mediaResult(article(),[input],new Date('2026-11-13T03:00:00Z')),null);
});
test('score orientation and win/loss must agree, shooting and stored results cannot conflict',()=>{
 const input=fixture();
 assert.equal(mediaResult(article(undefined,{paragraphs:['贝拉维斯塔预备高中以58-78战胜Elite Sports Academy。','张宇辰得到6分。']}),[input]),null);
 assert.equal(mediaResult(article(),[{...input,state:'post',schoolScore:80,opponentScore:58}]),null);
 const reverse=article(undefined,{paragraphs:['Elite Sports Academy以58-78不敌贝拉维斯塔预备高中。','贝拉维斯塔预备高中的张宇辰登场15分钟，得到6分。']});
 assert.equal(mediaResult(reverse,[input]).schoolScore,78);
 assert.equal(mediaResult(article(undefined,{paragraphs:['贝拉维斯塔预备高中以78-58战胜Elite Sports Academy。','贝拉维斯塔预备高中的张宇辰全场3投2中，三分1投1中，罚球2罚2中，拿下6分。']}),[input]),null);
});
test('media can fill gaps but never overwrite official statistics; mixed-source provenance survives normalization',()=>{
 const input={...fixture(),state:'post',schoolScore:78,opponentScore:58,players:[{playerId:'zhangyuchen',stats:{PTS:'6',REB:'3'}}]};
 const result=mediaResult(article(),[input]);assert.equal(result.sourceUrl,input.sourceUrl);assert.equal(result.players[0].statSources.PTS,input.sourceUrl);assert.equal(result.players[0].statSources.MIN,url);
 const normalized=normalizeRecord(result);assert.equal(normalized.players[0].statSources.MIN,url);
 assert.equal(mediaResult(article(),[{...input,players:[{playerId:'zhangyuchen',stats:{PTS:'7'}}]}]),null);
 const forged={...result,players:[{...result.players[0],stats:{...result.players[0].stats,MIN:'30'}}]};assert.throws(()=>normalizeRecord(forged),/media|evidence/i);
});
test('media trust is restricted to canonical articles and evidence cannot be omitted or tampered',()=>{
 assert.ok(isMediaUrl(url));for(const other of [url+'?x=1',url.replace('news.zhibo8.com','news.zhibo8.com.evil.test'),url.replace('https:','http:')])assert.equal(isMediaUrl(other),false);
 const result=mediaResult(article(),[fixture()]);assert.throws(()=>normalizeRecord({...result,evidence:undefined}),/source|media|evidence/i);
 assert.throws(()=>normalizeRecord({...result,evidence:{...result.evidence,bodyHash:'0'.repeat(64)}}),/evidence/i);
});
test('the actual result subject and statistic subject must be the tracked school and player',()=>{
 for(const paragraphs of [
  ['贝拉维斯塔预备高中与Elite Sports Academy进行热身赛，Other School以78-58战胜Elite Sports Academy。','贝拉维斯塔预备高中的张宇辰登场15分钟，得到6分。'],
  ['贝拉维斯塔预备高中以78-58战胜Elite Sports Academy。','贝拉维斯塔预备高中的张宇辰登场15分钟，队友Alex拿下6分3篮板。'],
  ['贝拉维斯塔预备高中以78-58战胜Elite Sports Academy。','贝拉维斯塔预备高中的张宇辰登场15分钟，王甲拿下6分3篮板。'],
  ['贝拉维斯塔预备高中以78-58战胜Elite Sports Academy。','贝拉维斯塔预备高中的张宇辰登场15分钟，最终李四拿下6分3篮板。'],
  ['贝拉维斯塔预备高中以78-58战胜Elite Sports Academy。','贝拉维斯塔预备高中的张宇辰登场15分钟，表现最好的李四拿下6分3篮板。'],
  ['贝拉维斯塔预备高中以78-58战胜Elite Sports Academy B。','贝拉维斯塔预备高中的张宇辰登场15分钟，得到6分。'],
 ])assert.equal(mediaResult(article(undefined,{paragraphs}),[fixture()]),null);
});

const ziyiReport=()=>article(HIGH_SCHOOL_PLAYERS.find(p=>p.id==='zhangziyi'),{sourceUrl:'https://news.zhibo8.com/nba/2026-11-15/6af90ea67768cnative.htm',publishedAt:'2026-11-15T01:55:20.000Z',title:'美高：中国16岁小将张子一迎着防守投进绝杀 砍下28分',paragraphs:['直播吧11月15日讯 美高赛事，Notre Dame Prep以73-72险胜One Way Academy，中国小将张子一贡献绝杀，全场砍下28分。','张子一现年16岁，身高2米08，是一名内线球员，出自上海男篮青训，同时也是中国国青男篮的队员。','今年9月29日，经纪公司精英传奇体育宣布，旗下球员张子一新赛季加盟美国诺特丹高中。']});
const ziyiGame=()=>({...fixture(HIGH_SCHOOL_PLAYERS.find(p=>p.id==='zhangziyi')),id:'neprep-9808148',date:'2026-11-14',localTime:'10:00',timeZone:'America/New_York',opponent:'One Way Basketball Institute (FL)'});
test('next-day report with reviewed aliases fills only explicitly reported points',()=>{
 const result=mediaResult(ziyiReport(),[ziyiGame()]);assert.ok(result);assert.deepEqual(result.players[0].stats,{PTS:'28'});assert.equal(normalizeRecord(result).players[0].stats.PTS,'28');assert.equal(result.schoolScore,73);assert.equal(result.opponentScore,72);
 const next=ziyiReport();next.publishedAt='2026-11-16T01:55:20.000Z';next.sourceUrl=next.sourceUrl.replace('11-15','11-16');assert.equal(mediaResult(next,[ziyiGame()]),null);
 assert.equal(mediaResult(ziyiReport(),[ziyiGame(),{...ziyiGame(),id:'second-game'}]),null);
 for(const tail of ['王甲砍下28分。','队友砍下28分。']){const e=ziyiReport();e.paragraphs=[e.paragraphs[0].replace('全场砍下28分。',tail)];e.bodyHash=createHash('sha256').update(e.paragraphs.join('\n')).digest('hex');assert.equal(mediaResult(e,[ziyiGame()]),null);}
});
test('conflicting final is reviewable without importing points or losing ambiguous fixture protection',()=>{
 const {inspectMediaResult}=require('./high-school-lib/high-school-media-evidence');assert.equal(typeof inspectMediaResult,'function');
 const record={...ziyiGame(),state:'post',schoolScore:72,opponentScore:71};const report=inspectMediaResult(ziyiReport(),[record]);assert.equal(report.reason,'final_score_conflict');assert.equal(report.result,null);assert.equal(report.candidate.id,'neprep-9808148');assert.deepEqual(report.candidate.players[0].stats,{PTS:'28'});assert.equal(mediaResult(ziyiReport(),[record]),null);assert.equal(record.players,undefined);
 assert.equal(inspectMediaResult(ziyiReport(),[record,{...record,id:'other',schoolScore:73,opponentScore:72}]).reason,'ambiguous_fixture');
});
test('existing player-stat conflict cannot remove one fixture and make a nearby rematch appear unique',()=>{
 const first={...ziyiGame(),state:'post',schoolScore:73,opponentScore:72,players:[{playerId:'zhangziyi',stats:{PTS:'27'}}]};
 assert.equal(mediaResult(ziyiReport(),[first,{...ziyiGame(),id:'nearby-rematch',localTime:'11:00'}]),null);
});
test('a team-first scoreboard clause can introduce the following player clause',()=>{
 const e=ziyiReport();e.paragraphs=[e.paragraphs[0].replace('直播吧11月15日讯 美高赛事，','')];e.bodyHash=createHash('sha256').update(e.paragraphs.join('\n')).digest('hex');
 assert.deepEqual(mediaResult(e,[ziyiGame()])?.players[0].stats,{PTS:'28'});
});
test('an explicit conflicting local game date cannot be bypassed by next-day publication',()=>{
 const e=ziyiReport();e.paragraphs[0]='美国当地时间11月13日，'+e.paragraphs[0];e.bodyHash=createHash('sha256').update(e.paragraphs.join('\n')).digest('hex');assert.equal(mediaResult(e,[ziyiGame()]),null);
});
