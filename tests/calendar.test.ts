import { describe, expect, test } from 'bun:test';
import { CalendarDataError, generateCalendar, normalizeCourses } from '../src/server/calendar';
import type { Course } from '../src/shared';

// Entirely synthetic; no student information or captured course schedules.
function fixture() {
  return {
    course_identifier2: 'TEST1001', course_official_title: 'Synthetic course',
    class_data: { classes: [{
      id: 101, identifier: 'section-a', section_code: '001',
      meeting_details: [{
        id: 20, begin_date: '2026-09-08', end_date: '2026-11-10',
        meeting_pattern: { meetingpatterndetail_set: [
          { id: 30, week_day: 'Tu', from_time: '10:10:00', to_time: '11:25:00' },
          { id: 31, week_day: 'Th', from_time: '13:00:00', to_time: '14:15:00' },
        ] },
        room: { id: 1, room_code: '101', building: { building_name: 'Example Hall' } },
      }],
    }] },
  };
}

function courses(): Course[] {
  return normalizeCourses([fixture()], new Set(['101'])).courses;
}

function calendar(overrides: Partial<Parameters<typeof generateCalendar>[0]> = {}) {
  return generateCalendar({
    calendarId: 'synthetic-calendar', title: '我的课表', courses: courses(),
    excludedDates: [], updatedAt: '2026-09-01T12:00:00Z', ...overrides,
  });
}

const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const uids = (ics: string) => unfold(ics).split('\r\n').filter(line => line.startsWith('UID:'));

describe('normalizeCourses', () => {
  test('filters registered sections, keeps differing row times, and deduplicates batched courses', () => {
    const raw = fixture();
    raw.class_data.classes.push({ ...raw.class_data.classes[0]!, id: 102 });
    const result = normalizeCourses([raw, structuredClone(raw)], new Set(['101']));
    expect(result.warnings).toEqual([]);
    expect(result.courses).toHaveLength(1);
    expect(result.courses[0]!.meetings.map(meeting => [meeting.days, meeting.startTime, meeting.location]))
      .toEqual([[[2], '10:10:00', '101 Example Hall'], [[4], '13:00:00', '101 Example Hall']]);
  });

  test('preserves meeting identities across time, title, room and upstream row ordering changes', () => {
    const raw = fixture();
    const before = normalizeCourses([raw], new Set(['101'])).courses[0]!.meetings.map(meeting => meeting.id).sort();
    raw.course_official_title = 'Updated title';
    raw.class_data.classes[0]!.meeting_details[0]!.room.room_code = '202';
    raw.class_data.classes[0]!.meeting_details[0]!.meeting_pattern.meetingpatterndetail_set[0]!.from_time = '10:30:00';
    raw.class_data.classes[0]!.meeting_details[0]!.meeting_pattern.meetingpatterndetail_set.reverse();
    expect(normalizeCourses([raw], new Set(['101'])).courses[0]!.meetings.map(meeting => meeting.id).sort()).toEqual(before);
  });

  test('ID-less fallback does not change when time or room changes', () => {
    const raw = fixture();
    const detail = raw.class_data.classes[0]!.meeting_details[0]!;
    Reflect.deleteProperty(detail, 'id');
    for (const row of detail.meeting_pattern.meetingpatterndetail_set) Reflect.deleteProperty(row, 'id');
    const before = normalizeCourses([raw], new Set(['101'])).courses[0]!.meetings.map(meeting => meeting.id);
    detail.meeting_pattern.meetingpatterndetail_set[0]!.from_time = '09:30:00';
    detail.room.room_code = '202';
    expect(normalizeCourses([raw], new Set(['101'])).courses[0]!.meetings.map(meeting => meeting.id)).toEqual(before);
  });

  test('warns on TBD without inventing a meeting and honors special room names', () => {
    const raw = fixture();
    raw.class_data.classes[0]!.meeting_details[0]!.meeting_pattern.meetingpatterndetail_set[0]!.from_time = 'TBD';
    const room = raw.class_data.classes[0]!.meeting_details[0]!.room;
    Object.assign(room, { id: 0, room_name: 'Online' });
    const result = normalizeCourses([raw], new Set(['101']));
    expect(result.warnings.join(' ')).toContain('待定');
    expect(result.courses[0]!.meetings).toHaveLength(1);
    expect(result.courses[0]!.meetings[0]!.location).toBe('Online');
  });

  test('rejects malformed, unsupported, incomplete and conflicting responses', () => {
    for (const raw of [[{}], [{ class_data: { classes: {} } }], []]) {
      expect(() => normalizeCourses(raw, new Set(['101']))).toThrow(CalendarDataError);
    }
    for (const patch of [{ begin_date: '2026-02-30' }, { end_date: '2025-09-01' }, { end_date: '2029-09-01' }]) {
      const raw = fixture();
      Object.assign(raw.class_data.classes[0]!.meeting_details[0]!, patch);
      expect(() => normalizeCourses([raw], new Set(['101']))).toThrow(CalendarDataError);
    }
    for (const patch of [{ week_day: 'XX' }, { week_day: '__proto__' }, { from_time: '25:00:00' }, { from_time: '11:25:00' }]) {
      const raw = fixture();
      Object.assign(raw.class_data.classes[0]!.meeting_details[0]!.meeting_pattern.meetingpatterndetail_set[0]!, patch);
      expect(() => normalizeCourses([raw], new Set(['101']))).toThrow(CalendarDataError);
    }
    const conflicting = fixture();
    conflicting.course_official_title = 'Conflicting';
    expect(() => normalizeCourses([fixture(), conflicting], new Set(['101']))).toThrow(CalendarDataError);
    expect(normalizeCourses([], new Set())).toEqual({ courses: [], warnings: [] });
  });
});

describe('generateCalendar', () => {
  test('uses New York DST, local exclusions and stable snapshot timestamps', () => {
    const result = calendar({ excludedDates: ['2026-09-10'] });
    expect(result.ics).toContain('DTSTART:20260908T141000Z\r\n');
    expect(result.ics).toContain('DTSTART:20261110T151000Z\r\n');
    expect(result.ics).not.toContain('DTSTART:20260910');
    expect(result.ics).toContain('DTSTAMP:20260901T120000Z\r\n');
    expect(result.ics).toContain('LAST-MODIFIED:20260901T120000Z\r\n');
    expect(result.eventCount).toBe(18);
    expect(result).toEqual(calendar({ excludedDates: ['2026-09-10'] }));
  });

  test('time and location updates keep UIDs; calendar namespaces separate them', () => {
    const changed = courses();
    for (const meeting of changed[0]!.meetings) { meeting.startTime = '10:30'; meeting.location = 'New room'; }
    expect(uids(calendar({ courses: changed, updatedAt: '2026-09-02T12:00:00Z' }).ics)).toEqual(uids(calendar().ics));
    expect(uids(calendar({ calendarId: 'different-calendar' }).ics)).not.toEqual(uids(calendar().ics));
  });

  test('cross-midnight events end on the following local day even at DST transition', () => {
    const changed = courses();
    changed[0]!.meetings = [{ ...changed[0]!.meetings[0]!, startDate: '2026-10-31', endDate: '2026-10-31', days: [6], startTime: '23:30', endTime: '02:30' }];
    const result = calendar({ courses: changed });
    expect(result.eventCount).toBe(1);
    expect(result.ics).toContain('DTSTART:20261101T033000Z');
    expect(result.ics).toContain('DTEND:20261101T073000Z');
    expect(calendar({ courses: changed, excludedDates: ['2026-10-31'] }).eventCount).toBe(0);
  });

  test('rejects nonexistent spring DST times and chooses first repeated fall time', () => {
    const changed = courses();
    changed[0]!.meetings = [{ ...changed[0]!.meetings[0]!, startDate: '2026-03-08', endDate: '2026-03-08', days: [0], startTime: '02:30', endTime: '03:30' }];
    expect(() => calendar({ courses: changed })).toThrow(CalendarDataError);
    Object.assign(changed[0]!.meetings[0]!, { startDate: '2026-11-01', endDate: '2026-11-01', startTime: '01:30', endTime: '02:30' });
    expect(calendar({ courses: changed }).ics).toContain('DTSTART:20261101T053000Z');
  });

  test('escapes RFC text, blocks newline injection, folds UTF8 at 75 octets and uses CRLF', () => {
    const changed = courses();
    changed[0]!.title = '课程😀'.repeat(40) + '\r\nBEGIN:VEVENT;hello,world\\end';
    changed[0]!.meetings[0]!.location = 'Room\nEND:VEVENT';
    const result = calendar({ courses: changed, title: 'Title\r\nBEGIN:VEVENT' });
    expect(unfold(result.ics)).toContain('\\nBEGIN:VEVENT\\;hello\\,world\\\\end');
    expect(result.ics.split('\r\n').filter(line => line === 'BEGIN:VEVENT')).toHaveLength(result.eventCount);
    expect(result.ics).not.toMatch(/(?<!\r)\n|\r(?!\n)/);
    for (const line of result.ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(result.ics).not.toContain('�');
    expect(result.ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  test('validates normalized input and bounds expansion', () => {
    expect(() => calendar({ excludedDates: ['2026-02-30'] })).toThrow(CalendarDataError);
    expect(() => calendar({ updatedAt: 'invalid' })).toThrow(CalendarDataError);
    const changed = courses();
    changed[0]!.meetings[0]!.endDate = '2030-01-01';
    expect(() => calendar({ courses: changed })).toThrow(CalendarDataError);
    const many = courses();
    many[0]!.meetings = Array.from({ length: 400 }, (_, i) => ({ ...many[0]!.meetings[0]!, id: String(i), startDate: '2026-01-01', endDate: '2026-12-31' }));
    expect(() => calendar({ courses: many })).toThrow(CalendarDataError);
  });
});
