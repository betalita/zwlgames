'use strict';

const LEAGUE = 'high-school-basketball';
const SEASON = 2027;
// School and squad are separate identities: Link HS Elite is not Link Varsity
// or Post Grad. Bind these mappings to one season so transfers need review.
const SCHOOLS = {
  'bella-vista': { name: 'Bella Vista College Prep', nameZh: '贝拉维斯塔预备高中', location: 'Phoenix, AZ',
    url: 'https://www.bellavistaathletics.com/', timeZone: 'America/Phoenix', seed: true },
  'wasatch-national': { name: 'Wasatch Academy National', nameZh: '瓦萨奇学院全国队', location: 'Mt. Pleasant, UT',
    url: 'https://www.basketball.wasatchacademy.org/schedule', timeZone: 'America/Denver', seed: true },
  'providence-tn-varsity': { name: 'Providence Christian Academy (Murfreesboro, TN)', nameZh: '普罗维登斯基督学院（田纳西）', location: 'Murfreesboro, TN',
    url: 'https://providencechristian.com/calendar/athletics-calendar-list/', timeZone: 'America/Chicago', adapter: 'providence' },
  'veritas-national': { name: 'Veritas Academy (CA)', nameZh: '维里塔斯学院（加州）', location: 'Chino Hills, CA',
    url: 'https://veritasbasketball.com/schedule', timeZone: 'America/Los_Angeles', seed: true },
  // Player/coach identity: RecruitTheBronx prospect 45154; the school confirms
  // James Cray and its separate prep program. Never use the CA namesake or NY varsity schedule.
  'notre-dame-prep-ny': { name: 'Notre Dame Prep (Elmira, NY)', nameZh: '圣母预备高中（纽约埃尔迈拉）', location: 'Elmira, NY',
    url: 'https://www.notredamehighschool.com/boys-prep-basketball', timeZone: 'America/New_York' },
  'link-hs-elite': { name: 'Link Academy HS Elite', nameZh: '林克学院高中精英队', location: 'Branson, MO',
    url: 'https://linkhoops.com/hs-elite-schedule', timeZone: 'America/Chicago', adapter: 'link' },
  'patrick-school': { name: 'The Patrick School', nameZh: '帕特里克高中', location: 'Hillside, NJ',
    url: 'https://thepatrickschool.org/schedule/', timeZone: 'America/New_York' },
  'phelps-national': { name: 'The Phelps School National', nameZh: '菲尔普斯高中全国队', location: 'Malvern, PA',
    url: 'https://www.thephelpsschool.org/athletics/schedules', timeZone: 'America/New_York', adapter: 'phelps' },
  'peddie-varsity': { name: 'The Peddie School Varsity', nameZh: '佩迪高中校队', location: 'Hightstown, NJ',
    url: 'https://peddie.org/peddie-education/athletics/athletics-schedule/', timeZone: 'America/New_York', adapter: 'peddie' },
};

const HIGH_SCHOOL_PLAYERS = [
  { id: 'zhangyuchen', name: '张宇辰', englishName: 'Yuchen Zhang', schoolId: 'bella-vista', position: 'G', heightCm: 185, graduationYear: 2028 },
  { id: 'zhangyizhaojie', name: '张懿赵杰', englishName: 'Jay Zhang', aliases: ['Yizhaojie Zhang'], schoolId: 'wasatch-national', position: 'F', heightCm: 203, graduationYear: 2028 },
  { id: 'liuzhenhe', name: '刘朕赫', englishName: 'Jack Liu', schoolId: 'providence-tn-varsity', position: 'C', heightCm: 210, graduationYear: 2027 },
  { id: 'yangyixuan', name: '杨易轩', englishName: 'Yixuan Yang', schoolId: 'veritas-national', position: 'F', heightCm: 201, graduationYear: 2027 },
  { id: 'zhangziyi', name: '张子一', englishName: 'Ziyi Zhang', aliases: ['Kobe Zhang'], schoolId: 'notre-dame-prep-ny', position: 'C', heightCm: 208, graduationYear: 2029 },
  { id: 'liuhaoxin', name: '刘浩鑫', englishName: 'Haoxin Liu', schoolId: 'link-hs-elite', position: 'C', heightCm: 210,
    aliases: ['Haoxin Lui'], graduationYear: 2028 },
  { id: 'lvyu', name: '吕煜', englishName: 'Yu Lyu', schoolId: 'patrick-school', position: 'PF', heightCm: 203, graduationYear: 2028 },
  { id: 'yueboran', name: '岳铂然', englishName: 'Moon Yue', schoolId: 'phelps-national', position: 'C', heightCm: 208,
    aliases: ['Bo Ran Yue'], graduationYear: 2028 },
  { id: 'xiongziyi', name: '熊子奕', englishName: 'Ziyi Xiong', schoolId: 'peddie-varsity', position: 'PF/C', heightCm: 210, graduationYear: 2027 },
].map(player => ({ ...player, leagues: [LEAGUE], seasonTeam: { season: SEASON,
  id: player.schoolId, name: SCHOOLS[player.schoolId].name } }));

function sourceCatalog() {
  return HIGH_SCHOOL_PLAYERS.map(player => ({ playerId: player.id, name: player.name,
    schoolId: player.schoolId, school: SCHOOLS[player.schoolId].name, season: SEASON,
    sourceUrl: SCHOOLS[player.schoolId].url, live: false,
    scheduleMode: SCHOOLS[player.schoolId].adapter ? 'official-html' :
      SCHOOLS[player.schoolId].seed ? 'verified-seed' : 'verified-import',
    ...(SCHOOLS[player.schoolId].seed ? { seedVerifiedAt: '2026-11-11' } : {}),
    playerStatsMode: 'verified-import',
    snapshotEnabled: Boolean(process.env.HIGH_SCHOOL_SNAPSHOT_URL),
    snapshotStatsFallback: Boolean(process.env.HIGH_SCHOOL_SNAPSHOT_URL) &&
      ['wasatch-national','bella-vista','veritas-national'].includes(player.schoolId) ? 'legitgm-verified-match' : null }));
}

module.exports = { LEAGUE, SEASON, SCHOOLS, HIGH_SCHOOL_PLAYERS, sourceCatalog };
