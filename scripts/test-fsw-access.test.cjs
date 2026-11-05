'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectResponse } = require('./test-fsw-access.cjs');

test('HTTP 200 challenge pages do not count as accessible data', () => {
  assert.equal(inspectResponse('schedule', 200, '<title>Just a moment...</title> cf-chl-').ok, false);
  assert.equal(inspectResponse('schedule', 200, 'Welcome to our website').ok, false);
});
test('recognizes the requested season, calendar, and Zhao box score', () => {
  assert.equal(inspectResponse('schedule', 200, '2026-27 Florida SouthWestern Men’s Basketball Schedule').ok, true);
  assert.equal(inspectResponse('calendar', 200, 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20261030T210000Z\nEND:VEVENT\nEND:VCALENDAR').ok, true);
  assert.equal(inspectResponse('boxscore', 200, '<h1>Florida SouthWestern</h1>Final Box Score Weilun Zhao').ok, true);
});
test('HTTP errors and unrelated calendars or box scores fail', () => {
  assert.equal(inspectResponse('schedule', 403, 'Access denied').ok, false);
  assert.equal(inspectResponse('calendar', 200, 'BEGIN:VCALENDAR\nEND:VCALENDAR').ok, false);
  assert.equal(inspectResponse('boxscore', 200, 'Florida SouthWestern Final Box Score').ok, false);
});
