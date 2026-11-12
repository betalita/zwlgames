'use strict';

// Verified 2026-11-11. Only individually dated matchups are transcribed. Date
// ranges and tournament names are not individual games. These are bootstrap
// records, never updates: subsequent operator corrections/results take priority.
const wasatchSource = 'https://www.basketball.wasatchacademy.org/s/2026-27-Schedule.pdf';
const veritasSource = 'https://veritasbasketball.com/schedule';
const SEEDS = [
  ...[
    ['wasatch-faith-family', '2026-11-20', 'Faith Family', 'unknown'],
    ['wasatch-pineview', '2026-12-08', 'Pineview', 'unknown'],
    ['wasatch-maple-mountain', '2027-01-05', 'Maple Mountain', 'unknown'],
    ['wasatch-orem', '2027-01-12', 'Orem', 'unknown'],
    ['wasatch-layton-christian', '2027-01-19', 'Layton Christian', 'unknown'],
    ['wasatch-cottonwood', '2027-02-16', 'Cottonwood', 'unknown'],
    ['wasatch-iowa-united', '2027-02-26', 'Iowa United', 'unknown'],
  ].map(([id, date, opponent, venue]) => ({ id, schoolId: 'wasatch-national', date, opponent, venue, sourceUrl: wasatchSource })),
  ...[
    ['veritas-bella-vista', '2026-11-20', 'CIA Bella Vista', 'away'],
    ['veritas-az-compass', '2027-02-12', 'AZ Compass', 'home'],
    ['veritas-wasatch', '2027-02-14', 'Wasatch Academy', 'home'],
    ['veritas-dream-city', '2027-02-26', 'Dream City Christian', 'home'],
  ].map(([id, date, opponent, venue]) => ({ id, schoolId: 'veritas-national', date, opponent, venue, sourceUrl: veritasSource })),
].map(record => ({ ...record, id: `seed2027-${record.id}`, season: 2027, state: 'pre',
  ...(record.schoolId === 'veritas-national' && record.opponent === 'CIA Bella Vista' ? { opponentSchoolId: 'bella-vista' } : {}),
  ...(record.schoolId === 'veritas-national' && record.opponent === 'Wasatch Academy' ? { opponentSchoolId: 'wasatch-national' } : {}) }));

module.exports = { SEEDS };
