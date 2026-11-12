'use strict';

function chinaDate(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms + 8 * 3600000).toISOString().slice(0, 10) : null;
}

function seasonYear(league, now = new Date()) {
  const day = chinaDate(now.toISOString());
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  if (league === 'wnba') return year;
  return month >= 7 ? year + 1 : year;
}

function dateRange(center, before = 3, after = 7) {
  const start = Date.parse(`${center}T00:00:00Z`);
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0, 10) !== center) throw new Error('invalid date');
  return Array.from({ length: before + after + 1 }, (_, i) => new Date(start + (i - before) * 86400000).toISOString().slice(0, 10));
}

function earliestTrackedGameDate(now = new Date()) {
  return dateRange(chinaDate(now.toISOString()), 3, 0)[0];
}

function earliestPreseasonGameDate(now = new Date()) {
  return chinaDate(new Date(now.getTime() - 365 * 86400000).toISOString());
}

function logo(team = {}) {
  const logos = team.logos || [];
  return (logos.find(x => (x.rel || []).includes('default')) || logos[0] || {}).href || team.logo || null;
}

function teamFromCompetitor(item = {}) {
  const team = item.team || {};
  const score = item.score;
  return {
    id: String(team.id || item.id || ''), name: team.displayName || team.shortDisplayName || team.name || '待定',
    abbreviation: team.abbreviation || '', logo: logo(team),
    score: score == null ? null : String(typeof score === 'object' ? score.displayValue ?? score.value ?? '' : score),
    winner: item.winner === true, linescores: item.linescores || [],
  };
}

function gameFromEvent(event, league, requestedSeasonType = null) {
  const competition = (event.competitions || [])[0] || {};
  const competitors = competition.competitors || [];
  const status = (competition.status || event.status || {});
  const date = event.date || competition.date;
  const dateKey = chinaDate(date);
  if (!event.id || !dateKey) return null;
  const sourceType = Number(event.season?.type || requestedSeasonType);
  return {
    league, eventId: String(event.id), season: Number((event.season || {}).year) || seasonYear(league, new Date(date)),
    seasonType: [1, 2, 3].includes(sourceType) || league === 'nba-development' && sourceType === 5
      ? sourceType : null,
    startsAt: new Date(date).toISOString().slice(0, 19).replace('T', ' '), dateKey,
    name: event.name || '', state: (status.type || {}).state || 'pre',
    statusText: (status.type || {}).shortDetail || (status.type || {}).detail || '', period: status.period || 0,
    home: teamFromCompetitor(competitors.find(x => x.homeAway === 'home')),
    away: teamFromCompetitor(competitors.find(x => x.homeAway === 'away')),
  };
}

function playerStats(summary, playerId, englishName = '') {
  for (const team of ((summary || {}).boxscore || {}).players || []) {
    for (const group of team.statistics || []) {
      for (const athlete of group.athletes || []) {
        const identity = athlete.athlete || {};
        const sameId = playerId && String(identity.id) === String(playerId);
        const sameName = englishName && String(identity.displayName || identity.fullName || '').toLowerCase().replace(/[^a-z]/g, '') === englishName.toLowerCase().replace(/[^a-z]/g, '');
        if (!sameId && !sameName) continue;
        if (athlete.didNotPlay) return { state: 'dnp', reason: athlete.reason || '未出场', stats: null };
        if (!Array.isArray(athlete.stats) || !athlete.stats.length) return { state: 'missing', reason: null, stats: null };
        const stats = {};
        (group.labels || []).forEach((label, i) => { stats[label] = athlete.stats[i] ?? null; });
        return { state: 'ready', reason: null, stats };
      }
    }
  }
  return { state: 'missing', reason: null, stats: null };
}

function fullBoxscore(summary) {
  const teams = (((summary || {}).boxscore || {}).players || []).map(item => ({
    teamId: String(item.team?.id || ''),
    groups: (item.statistics || []).map(group => ({
      name: group.name || '', labels: group.labels || [],
      athletes: (group.athletes || []).map(row => ({
        id: String(row.athlete?.id || ''),
        name: row.athlete?.displayName || row.athlete?.fullName || '',
        jersey: String(row.athlete?.jersey || ''),
        position: row.athlete?.position?.abbreviation || '',
        starter: row.starter === true,
        onCourt: typeof row.active === 'boolean' ? row.active : null,
        didNotPlay: row.didNotPlay === true,
        reason: row.reason || null,
        stats: Array.isArray(row.stats) ? row.stats : [],
      })),
    })),
  })).filter(team => team.groups.some(group => group.athletes.length));
  return teams.length >= 2 && teams[0].teamId && teams[1].teamId &&
    teams[0].teamId !== teams[1].teamId ? teams : null;
}

function teamStats(summary) {
  return (((summary || {}).boxscore || {}).teams || []).map(item => ({
    teamId: String((item.team || {}).id || ''),
    statistics: (item.statistics || []).map(s => ({ name: s.name, label: s.label || s.displayValue, value: s.displayValue ?? s.value ?? null })),
  }));
}

function seasonStats(source = {}, requestedSeason = null) {
  const categories = source.categories || [];
  const names = { gamesplayed: 'GP', avgpoints: 'PTS', pointspergame: 'PTS',
    avgrebounds: 'REB', reboundspergame: 'REB', avgassists: 'AST', assistspergame: 'AST',
    avgfieldgoalpct: 'FG_PCT', avgfieldgoalspct: 'FG_PCT', fieldgoalpct: 'FG_PCT',
    fieldgoalspct: 'FG_PCT', fieldgoalpercentage: 'FG_PCT',
    avgthreepointfieldgoalpct: 'THREE_PCT', avgthreepointfieldgoalspct: 'THREE_PCT',
    threepointfieldgoalpct: 'THREE_PCT', avgthreepointpct: 'THREE_PCT',
    threepointpct: 'THREE_PCT', avgminutes: 'MIN', minutespergame: 'MIN' };
  const metric = key => names[String(key).toLowerCase().replace(/[^a-z0-9]/g, '')] ||
    ({ 'fg%': 'FG_PCT', '3p%': 'THREE_PCT', '3pt%': 'THREE_PCT' }[String(key).toLowerCase()]) ||
    String(key).toUpperCase();
  const category = categories.find(x => /average/i.test(x.name || '')) ||
    categories.find(x => /general/i.test(x.name || ''));
  if (category) {
    const rows = Array.isArray(category.statistics) ? category.statistics : [];
    const year = row => Number(row.season?.year || row.seasonYear || row.year);
    const dated = rows.filter(row => Number.isFinite(year(row)) && year(row) > 0);
    const row = requestedSeason
      ? (dated.length ? dated.find(item => year(item) === Number(requestedSeason)) : rows.length === 1 ? rows[0] : null)
      : dated.length ? dated.reduce((latest, item) => year(item) > year(latest) ? item : latest) : rows[0];
    if (rows.length && !row) return null;
    const values = row?.stats || category.totals || category.stats;
    const keys = category.labels || category.names;
    if (Array.isArray(keys) && Array.isArray(values)) {
      const result = {};
      keys.forEach((key, index) => {
        result[metric(key)] = values[index] ?? null;
      });
      for (const other of categories) {
        if (other === category) continue;
        const otherRows = other.statistics || [];
        const otherRow = requestedSeason
          ? otherRows.find(item => Number(item.season?.year || item.seasonYear || item.year) === Number(requestedSeason))
          : otherRows[0];
        const otherValues = otherRow?.stats || other.totals || other.stats;
        if (!Array.isArray(otherValues)) continue;
        (other.labels || other.names || []).forEach((key, index) => {
          const label = metric(key);
          if ((label === 'FG_PCT' || label === 'THREE_PCT' ||
              label === 'MIN' && /average|per.game/i.test(other.name || '')) &&
              result[label] == null) result[label] = otherValues[index] ?? null;
        });
      }
      return result;
    }
  }
  const section = (source || {}).statistics || {};
  const split = (section.splits || []).find(x => /regular season/i.test(x.displayName || '')) || (section.splits || [])[0];
  const values = split?.stats || section.displayValues || section.values;
  if (!values) return null;
  const result = {};
  (section.labels || []).forEach((label, index) => { result[label] = values[index] ?? null; });
  return result;
}

function athleteBio(profile = {}, overview = {}) {
  const athlete = overview.athlete || {};
  const position = profile.position?.abbreviation || athlete.position?.abbreviation || null;
  const inches = Number(profile.height ?? athlete.height);
  const display = String(profile.displayHeight || athlete.displayHeight || '');
  const parts = /^(\d+)\s*['′]\s*(\d+)\s*(?:["″])?$/.exec(display);
  const measured = Number.isFinite(inches) && inches > 0
    ? inches <= 110 ? inches * 2.54 : inches
    : parts ? (Number(parts[1]) * 12 + Number(parts[2])) * 2.54 : null;
  const birth = String(profile.dateOfBirth || athlete.dateOfBirth || '').slice(0, 10);
  return { position, heightCm: measured ? Math.round(measured) : null,
    birthDate: /^\d{4}-\d{2}-\d{2}$/.test(birth) && Number.isFinite(Date.parse(`${birth}T00:00:00Z`)) ? birth : null };
}

function collegeClass(athlete = {}) {
  const value = athlete.experience?.displayValue || athlete.experience?.abbreviation || '';
  const normalized = String(value).trim();
  return /^(?:(?:redshirt|rs|r)[ -]?)?(?:freshman|sophomore|junior|senior|fr|so|jr|sr)$|^(?:graduate(?: student)?|grad)$/i.test(normalized)
    ? normalized : null;
}

function athleteBirthplace(athlete = {}) {
  const place = athlete.birthPlace || athlete.birthplace;
  if (typeof place === 'string') return place.trim() || null;
  if (!place || typeof place !== 'object') return null;
  if (typeof place.displayValue === 'string' && place.displayValue.trim()) return place.displayValue.trim();
  const parts = [place.city, place.state, place.country].filter(value =>
    typeof value === 'string' && value.trim()).map(value => value.trim());
  return parts.length ? parts.join(', ') : null;
}

function findAthlete(roster, name, athleteId = null) {
  const tokens = value => String(value || '').toLowerCase().match(/[a-z]+/g) || [];
  const target = tokens(name).sort().join('');
  const groups = Array.isArray(roster.athletes) ? roster.athletes : Object.values(roster.athletes || {});
  const entries = groups.flatMap(x => Array.isArray(x.items) ? x.items : [x]);
  const athletes = entries.map(x => x.athlete || x);
  if (athleteId) {
    const byId = athletes.find(x => String(x.id || '') === String(athleteId));
    if (byId) return byId;
  }
  return athletes.find(x => tokens(x.displayName || x.fullName).sort().join('') === target) || null;
}

function headshotUrl(profile = {}) {
  const raw = profile.headshot || profile.athlete?.headshot;
  const url = typeof raw === 'string' ? raw : raw?.href;
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' ? parsed.href : null;
  } catch (_) { return null; }
}

function averageGameStats(rows) {
  const labels = ['MIN', 'PTS', 'REB', 'AST', 'STL', 'BLK', 'TO', 'OREB', 'DREB', 'PF'];
  const result = { GP: String(rows.length) };
  for (const label of labels) {
    const values = rows.map(row => {
      const stats = typeof row === 'string' ? JSON.parse(row) : row;
      const number = Number.parseFloat(stats?.[label]);
      return Number.isFinite(number) ? number : null;
    }).filter(value => value !== null);
    if (values.length) result[label] = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1);
  }
  for (const [source, target] of [['FG', 'FG_PCT'], ['3PT', 'THREE_PCT']]) {
    let made = 0;
    let attempts = 0;
    for (const row of rows) {
      const stats = typeof row === 'string' ? JSON.parse(row) : row;
      const match = /^(\d+)-(\d+)$/.exec(String(stats?.[source] || ''));
      if (!match) continue;
      made += Number(match[1]);
      attempts += Number(match[2]);
    }
    if (attempts > 0) result[target] = String(Number((made / attempts).toFixed(3)));
  }
  return result;
}

module.exports = { chinaDate, seasonYear, dateRange, earliestTrackedGameDate, earliestPreseasonGameDate, gameFromEvent, playerStats, fullBoxscore, teamStats, seasonStats, athleteBio, collegeClass, athleteBirthplace, findAthlete, averageGameStats, headshotUrl, logo };
