'use strict';

const { createHash } = require('node:crypto');
const { SEASON, SCHOOLS } = require('./high-school-roster');
const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function plain(value) {
  return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&ndash;/gi,'–').replace(/\s+/g,' ').trim();
}
function localTime(text) {
  const match = /\b(\d{1,2}):([0-5]\d)\s*(AM|PM)\b/i.exec(text);
  return match ? `${String(Number(match[1]) % 12 + (/pm/i.test(match[3]) ? 12 : 0)).padStart(2,'0')}:${match[2]}` : undefined;
}
function dateFrom(text, year) {
  const match = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})(?:,?\s+(20\d{2}))?/i.exec(text);
  if (!match) return null;
  const month = months.indexOf(match[1].toLowerCase()) + 1;
  return `${match[3] || (month >= 7 ? year - 1 : year)}-${String(month).padStart(2,'0')}-${match[2].padStart(2,'0')}`;
}
function placeholder(opponent) {
  return !opponent || /\b(?:TBA|TBD|Round of|Final Four|Nationals|Classic|Festival|Invitational|Invational|Tournament|Showcase)\b/i.test(opponent);
}
function scheduleStatus(text) {
  return /cancel/i.test(text) ? 'cancelled' : /postpon/i.test(text) ? 'postponed' : null;
}
function cleanStatus(text) {
  return text.replace(/^(?:cancelled|canceled|postponed)\s*[:–-]\s*/i, '')
    .replace(/\s*\((?:cancelled|canceled|postponed)\)\s*/gi, '').trim();
}
function base(schoolId, date, opponent, detail = {}) {
  const school = SCHOOLS[schoolId];
  return { id: createHash('sha256').update(`${date}:${opponent.toLowerCase()}`).digest('hex').slice(0, 32),
    schoolId, season: SEASON, date, opponent, sourceUrl: school.url, state: 'pre',
    venue: 'neutral', timeZone: school.timeZone, ...detail };
}
function result(text) {
  const match = /^\s*([WL])\s*(\d{1,3})\s*[-–]\s*(\d{1,3})\s*$/i.exec(text);
  if (!match) return {};
  // On these school schedules W/L scores are in school-opponent order.
  const schoolScore = Number(match[2]), opponentScore = Number(match[3]);
  if ((match[1].toUpperCase() === 'W') !== (schoolScore > opponentScore) || schoolScore === opponentScore)
    throw new Error('official result disagrees with win/loss');
  return { state: 'post', schoolScore, opponentScore };
}
function venueZone(location) {
  const state = /,\s*(SC|FL|KY|OH|IL|AZ|CA|UT|TX|IN|PA|NJ|MD|VA)\b/.exec(location)?.[1];
  return { SC: 'America/New_York', FL: 'America/New_York', KY: 'America/New_York', OH: 'America/New_York',
    IL: 'America/Chicago', AZ: 'America/Phoenix', CA: 'America/Los_Angeles', UT: 'America/Denver',
    TX: 'America/Chicago', IN: 'America/New_York', PA: 'America/New_York', NJ: 'America/New_York',
    MD: 'America/New_York', VA: 'America/New_York' }[state];
}

function parseSchoolSchedule(schoolId, html) {
  const school = SCHOOLS[schoolId];
  if (!school?.adapter) throw new Error('school requires verified schedule import');
  if (!['providence','phelps'].includes(school.adapter) &&
    !/2026\s*[-–]\s*(?:2027|27)\b/.test(plain(html))) throw new Error('official schedule season not verified');
  const games = [];
  if (school.adapter === 'providence') {
    for (const event of String(html).match(/<li\b[^>]*class="simcal-event\s[^>]*>[\s\S]*?<\/li>/gi) || []) {
      const rawTitle = plain(event.match(/class="simcal-event-title"[^>]*>([\s\S]*?)<\/span>/i)?.[1] || '');
      const title = cleanStatus(rawTitle);
      if (!/^HS (?:Girls\/)?Boys Basketball\b/.test(title) || /scrimmage/i.test(title)) continue;
      const date = event.match(/itemprop="startDate"\s+content="(\d{4}-\d{2}-\d{2})T/i)?.[1];
      const opponent = title.replace(/^HS (?:Girls\/)?Boys Basketball\s*(?:@|vs\.?)\s*/i, '').trim();
      if (!date || date < '2026-07-01' || date > '2027-06-30' || placeholder(opponent)) continue;
      // The calendar's start includes JV/girls games. Do not infer a varsity
      // boys tipoff from it, even when it supplies a precise timestamp.
      games.push(base(schoolId, date, opponent, { venue: title.includes('@') ? 'away' : 'home',
        scheduleStatus: scheduleStatus(rawTitle) }));
    }
  } else if (school.adapter === 'phelps') {
    const days = [...String(html).matchAll(/<div\b[^>]*class="fsCalendarDate"[^>]*data-day="(\d+)"[^>]*data-year="(\d{4})"[^>]*data-month="(\d+)"[^>]*>/gi)];
    for (let i = 0; i < days.length; i++) {
      const day = days[i];
      const date = `${day[2]}-${String(Number(day[3]) + 1).padStart(2,'0')}-${day[1].padStart(2,'0')}`;
      if (date < '2026-07-01' || date > '2027-06-30') continue;
      const segment = String(html).slice(day.index, days[i + 1]?.index || html.length);
      const titles = [...segment.matchAll(/<a\b[^>]*class="fsCalendarEventTitle[^>]*title="([^"]+)"[^>]*>/gi)];
      for (let j = 0; j < titles.length; j++) {
        const rawTitle = plain(titles[j][1]), title = cleanStatus(rawTitle);
        if (!/^National Basketball (?:vs\.|@)\s*/.test(title)) continue;
        const opponent = title.replace(/^National Basketball (?:vs\.|@)\s*/,'');
        if (placeholder(opponent)) continue;
        const detail = segment.slice(titles[j].index, titles[j + 1]?.index || segment.length);
        const time = detail.match(/datetime="\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}):\d{2}[+-]\d{2}:\d{2}"/i)?.[1];
        const nativeId = titles[j][0].match(/data-occur-id="(\d+)"/i)?.[1];
        games.push(base(schoolId, date, opponent, { localTime: time, venue: title.includes('@') ? 'away' : 'home',
          ...(nativeId ? { id: `phelps-${nativeId}`, sourceNativeId: `phelps-${nativeId}` } : {}),
          scheduleStatus: scheduleStatus(rawTitle) }));
      }
    }
  } else if (school.adapter === 'link') {
    for (const paragraph of String(html).match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) || []) {
      const parts = plain(paragraph).split(/\s*\/\/\s*/);
      if (parts.length < 3 || placeholder(parts[1])) continue;
      const date = dateFrom(parts[0], SEASON);
      if (!date) continue;
      const zone = venueZone(parts[2]);
      // Never use Branson's timezone for a travelling team's away tournament.
      games.push(base(schoolId, date, parts[1], { location: parts[2], timeZone: zone || school.timeZone,
        localTime: zone ? localTime(parts[0]) : undefined }));
    }
  } else if (school.adapter === 'peddie') {
    for (const row of String(html).match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []) {
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => plain(m[1]));
      if (cells[0] !== 'Boys Varsity Basketball' || cells.length < 4) continue;
      const text = cells[1], date = dateFrom(cells[2], SEASON);
      let opponent = text.replace(/^(?:at|vs\.?)\s+/i,'').trim();
      // Tournament titles can include other schools' games hosted by Peddie.
      // Only an explicit two-team matchup containing Peddie belongs here.
      const matchupText = opponent.replace(/^.*?\s[–-]\s*/, '').replace(/^vs\.?\s+/i, '');
      const matchup = matchupText.split(/\s+vs\.?\s+/i);
      const tournament = matchup.length > 1 || matchupText !== opponent;
      opponent = matchupText;
      if (matchup.length > 1) {
        const isPeddie = value => /^(?:the )?peddie(?: school)?(?: \(NJ\))?$/i.test(value.trim());
        if (matchup.length !== 2 || matchup.filter(isPeddie).length !== 1) continue;
        opponent = matchup.find(value => !isPeddie(value)).trim();
      }
      if (!date || placeholder(opponent)) continue;
      const nativeId = row.match(/data-bs-target="#modal-name-(\d+)"/i)?.[1];
      games.push(base(schoolId, date, opponent, { localTime: localTime(cells[3]),
        venue: tournament ? 'neutral' : /^at\s/i.test(text) ? 'away' : 'home',
        ...(nativeId ? { id: `peddie-${nativeId}`, sourceNativeId: `peddie-${nativeId}` } : {}),
        scheduleStatus: scheduleStatus(cells[5] || ''), ...result(cells[5] || '') }));
    }
  } else if (school.adapter === 'notredame') {
    const years = String(html).match(/<select\b[^>]*id="school-year-[^"]*"[^>]*>([\s\S]*?)<\/select>/i)?.[1];
    const selectedYear = years?.match(/<option\b[^>]*selected[^>]*>([^<]*)/i)?.[1];
    if (selectedYear !== '2026-2027') throw new Error('Notre Dame selected season not verified');
    const table = String(html).match(/<table\b[^>]*id="schedule-table"[^>]*>([\s\S]*?)<\/table>/i)?.[1];
    if (!table) throw new Error('Notre Dame schedule table missing');
    for (const row of table.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || []) {
      const cell = name => plain(row.match(new RegExp(`<span\\b[^>]*class="[^"]*${name}[^" ]*[^\"]*"[^>]*>([\\s\\S]*?)<\\/span>`, 'i'))?.[1] || '');
      const opponent = cell('event-opponent').replace(/^\*\s*/,'');
      const dateText = cell('event-date-time'), date = dateFrom(dateText, SEASON);
      if (!date || placeholder(opponent)) continue;
      const results = plain(row.match(/<td\b[^>]*data-label="RESULTS"[^>]*>([\s\S]*?)<\/td>/i)?.[1] || '');
      games.push(base(schoolId, date, opponent, { localTime: localTime(dateText),
        venue: /aria-label="At"/i.test(row) ? 'away' : 'home', scheduleStatus: scheduleStatus(plain(row)), ...result(results) }));
    }
  }
  if (!games.length) throw new Error('official schedule has no verified games; saved schedule retained');
  const unique = new Map(games.map(game => [game.id, game]));
  return [...unique.values()];
}

module.exports = { parseSchoolSchedule };
