'use strict';

const { SEASON } = require('./high-school-roster');
const { plain } = require('./high-school-external');

// Both subscriptions are linked by the school's public calendar. They expose
// the same underlying Google events, so they are transport fallbacks, not
// independent confirmation of a result or of an individual player's appearance.
const PAGE = 'https://www.bellavistacollegeprep.com/news-events/school-calendar.cfm';
const SCHOOL_ICAL = 'https://www.bellavistacollegeprep.com/pro/responsive/tools/includes/events/events_ical.cfm?detailid=461434&tool_type=';
const CALENDAR_ID = 'cba440a4501a277e8c272618817c6a4ebbb119d69256866696a66eab64e939ec';
const GOOGLE_ICAL = `https://calendar.google.com/calendar/ical/${CALENDAR_ID}%40group.calendar.google.com/public/basic.ics`;
const ZONE = 'America/Phoenix';

function matchup(title) {
  const clean = plain(title).replace(/^(?:cancelled|canceled|postponed)\s*[:–-]?\s*/i, '');
  // Never substitute BV Academy, National, Open, Power, girls, or varsity for
  // the explicitly labelled EYBL squad. Bare program names are not games.
  const match = /^EYBL\s+(vs\.?|@)\s+(.+?)\s*(?:\((?:cancelled|canceled|postponed)\))?$/i.exec(clean);
  if (!match || /\b(?:TBA|TBD|tournament|showcase|practice|scrimmage)\b/i.test(match[2])) return null;
  return { opponent: /^ESA$/i.test(match[2]) ? 'Elite Sports Academy' : match[2],
    venue: match[1] === '@' ? 'away' : 'unknown',
    ...(/cancel/i.test(title) ? { scheduleStatus: 'cancelled' } : /postpon/i.test(title) ? { scheduleStatus: 'postponed' } : {}) };
}

function nativeId(uid) {
  const id = new RegExp(`${CALENDAR_ID}@group\\.calendar\\.google\\.com\\|([a-z0-9]+)`).exec(uid)?.[1]
    || /^([a-z0-9]+)@google\.com$/.exec(uid)?.[1];
  if (!id || id.length > 36) throw new Error('Bella Vista calendar stable event UID missing');
  return `bv-calendar-${id}`;
}

function record(uid, date, localTime, detail) {
  if (date < '2026-07-01' || date > '2027-06-30') return null;
  const id = nativeId(uid);
  return { id, sourceNativeId: id, schoolId: 'bella-vista', season: SEASON,
    date, ...(localTime ? { localTime } : {}), timeZone: ZONE, sourceUrl: PAGE, state: 'pre', ...detail };
}

function parseCalendar(body) {
  const text = String(body).replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  if (!/^BEGIN:VCALENDAR\n/.test(text) || !/\nEND:VCALENDAR\s*$/.test(text) ||
      !/^X-WR-TIMEZONE:America\/Phoenix$/m.test(text)) throw new Error('Bella Vista calendar identity/timezone missing');
  const rows = [];
  for (const match of text.matchAll(/BEGIN:VEVENT\n([\s\S]*?)\nEND:VEVENT/g)) {
    const lines = match[1].split('\n');
    const value = name => lines.find(line => line.startsWith(name + ':'))?.slice(name.length + 1) || '';
    const detail = matchup(value('SUMMARY'));
    if (!detail) continue;
    const start = lines.find(line => line.startsWith('DTSTART')) || '';
    const utc = /^DTSTART:(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z$/.exec(start);
    const local = /^DTSTART;TZID=America\/Phoenix:(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)$/.exec(start);
    const allDay = /^DTSTART;VALUE=DATE:(\d{4})(\d\d)(\d\d)$/.exec(start);
    let date, time;
    if (utc) {
      const iso = `${utc[1]}-${utc[2]}-${utc[3]}T${utc[4]}:${utc[5]}:${utc[6]}Z`;
      const instant = new Date(iso);
      if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0,19) + 'Z' !== iso)
        throw new Error('invalid Bella Vista calendar start');
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric',
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(instant).map(p => [p.type, p.value]));
      date = `${parts.year}-${parts.month}-${parts.day}`; time = `${parts.hour}:${parts.minute}`;
    } else if (local || allDay) {
      const p = local || allDay;
      date = `${p[1]}-${p[2]}-${p[3]}`;
      if (local) time = `${p[4]}:${p[5]}`;
    } else throw new Error('unverified Bella Vista calendar start/timezone');
    if (value('STATUS') === 'CANCELLED') detail.scheduleStatus = 'cancelled';
    const row = record(value('UID'), date, time, detail);
    if (row) rows.push(row);
  }
  return verified(rows);
}

function parsePage(body) {
  if (!String(body).includes(`${CALENDAR_ID}@group.calendar.google.com`))
    throw new Error('Bella Vista school calendar identity missing');
  const events = [...String(body).matchAll(/<div\b[^>]*class="calendar_list_event\s[^>]*>/g)];
  const rows = [];
  for (let i = 0; i < events.length; i++) {
    const segment = String(body).slice(events[i].index, events[i + 1]?.index || body.length);
    const title = /class="calendar_list_title"[^>]*>\s*<a\b[^>]*>([\s\S]*?)<\/a>/.exec(segment)?.[1] || '';
    const detail = matchup(title);
    if (!detail) continue;
    const dt = plain(/class="calendar_list_dt"[^>]*>([\s\S]*?)<\/div>/.exec(segment)?.[1] || '');
    const stamp = /^(\w+) (\d{1,2}), (20\d\d)\s*\|\s*(\d{1,2}):([0-5]\d)\s*(AM|PM)\b/i.exec(dt);
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const month = stamp && months.findIndex(m => m.toLowerCase() === stamp[1].toLowerCase()) + 1;
    if (!stamp || !month || Number(stamp[4]) < 1 || Number(stamp[4]) > 12) throw new Error('Bella Vista calendar date/time missing');
    const date = `${stamp[3]}-${String(month).padStart(2,'0')}-${stamp[2].padStart(2,'0')}`;
    const time = `${String(Number(stamp[4]) % 12 + (/PM/i.test(stamp[6]) ? 12 : 0)).padStart(2,'0')}:${stamp[5]}`;
    const uid = events[i][0].match(/id="eventid_([^\"]+)"/)?.[1] || '';
    const row = record(uid, date, time, detail);
    if (row) rows.push(row);
  }
  return verified(rows);
}

function verified(rows) {
  if (!rows.length) throw new Error('Bella Vista calendar has no verified current EYBL matchups');
  const unique = new Map();
  for (const row of rows) {
    const prior = unique.get(row.id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(row)) throw new Error('Bella Vista duplicate event conflict');
    unique.set(row.id, row);
  }
  return [...unique.values()];
}

async function collectBellaVista(read, report) {
  const failures = [];
  for (const [source, url, parse] of [
    ['school-ical', SCHOOL_ICAL, parseCalendar], ['google-ical', GOOGLE_ICAL, parseCalendar], ['school-calendar', PAGE, parsePage],
  ]) {
    try {
      const rows = parse(await read(url));
      // Run the same date, identity and source validation before accepting a
      // fallback. A malformed feed cannot prevent trying the other transport.
      for (const row of rows) require('./high-school-records').normalizeRecord(row);
      report(source, 'ok', null, rows.length);
      return rows;
    } catch (error) { failures.push(`${source}: ${error.message}`); report(source, 'error', error.message); }
  }
  throw new Error(`Bella Vista calendar unavailable; ${failures.join('; ')}`);
}

module.exports = { collectBellaVista, parseCalendar, parsePage, PAGE, SCHOOL_ICAL, GOOGLE_ICAL };
