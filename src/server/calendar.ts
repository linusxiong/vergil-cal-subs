import type { CalendarSemester, Course, Meeting } from '../shared';

const DAY = 86_400_000;
const WEEKDAYS: Record<string, number> = { Su: 0, Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6 };
const zone = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

export class CalendarDataError extends Error {}

function invalid(): never {
  throw new CalendarDataError('课表数据格式异常，未更新日历。请重新同步；若仍失败，请反馈课程的日期和时间格式。');
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}

function list(value: unknown, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) invalid();
  return value;
}

function text(value: unknown, limit = 1000): string {
  if (value == null) return '';
  if (typeof value !== 'string' && typeof value !== 'number') invalid();
  const result = String(value).trim();
  if (result.length > limit || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(result)) invalid();
  return result;
}

function identity(value: unknown): string {
  return text(value, 256);
}

function pending(value: unknown): boolean {
  return value == null || (typeof value === 'string' && /^(?:TBD|TBA|NONE)?$/i.test(value.trim()));
}

function date(value: unknown): string {
  if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) invalid();
  const timestamp = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) invalid();
  return value;
}

function time(value: unknown): string {
  if (typeof value !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) invalid();
  return value.length === 5 ? value + ':00' : value;
}

function location(value: unknown): string {
  if (value == null) return '';
  const room = object(value);
  if (room.id === 0 || room.id === '0') return pending(room.room_name) ? '' : text(room.room_name);
  const building = room.building == null ? {} : object(room.building);
  return [room.room_code, building.building_name].filter(v => !pending(v)).map(v => text(v)).join(' ');
}

/** Normalize only enrolled sections; malformed responses must never replace a saved feed. */
export function normalizeCourses(rawCourses: unknown[], registeredIds: Set<string>): { courses: Course[]; warnings: string[] } {
  list(rawCourses, 1000);
  if (registeredIds.size > 500) invalid();
  const courses: Course[] = [];
  const warnings = new Set<string>();
  const found = new Set<string>();
  const seenSections = new Map<string, string>();
  for (const rawCourse of rawCourses) {
    const raw = object(rawCourse);
    const classes = list(object(raw.class_data).classes, 1000);
    for (const rawClass of classes) {
      const section = object(rawClass);
      const identifiers = [section.id, section.identifier, section.class_identifier].filter(v => v != null).map(identity);
      const id = identifiers.find(value => registeredIds.has(value));
      if (!id) continue;
      const serialized = JSON.stringify([section, raw.course_identifier2, raw.course_official_title]);
      if (found.has(id)) {
        if (seenSections.get(id) !== serialized) invalid();
        continue;
      }
      found.add(id);
      seenSections.set(id, serialized);
      const code = text(raw.course_identifier2) || id;
      const course: Course = {
        id, code, title: text(section.course_topic_title) || text(raw.course_official_title) || code,
        section: text(section.section_code), meetings: [],
      };
      const label = `${code}${course.section ? ` (${course.section})` : ''}`;
      if (section.meeting_details == null) {
        warnings.add(`${label}：上课安排待定，暂未生成事件；请在 Vergil 更新后重新同步。`);
      } else {
        const details = list(section.meeting_details, 100);
        if (!details.length) warnings.add(`${label}：没有上课安排，暂未生成事件；请核对 Vergil。`);
        const fallbackCounts = new Map<string, number>();
        const meetingIds = new Set<string>();
        for (const rawDetail of details) {
          const detail = object(rawDetail);
          if (pending(detail.begin_date) || pending(detail.end_date) || detail.meeting_pattern == null) {
            warnings.add(`${label}：上课日期或时间待定，已跳过该安排；请在 Vergil 更新后重新同步。`);
            continue;
          }
          const startDate = date(detail.begin_date);
          const endDate = date(detail.end_date);
          if (endDate < startDate || Date.parse(endDate) - Date.parse(startDate) > 366 * DAY) invalid();
          const pattern = object(detail.meeting_pattern);
          const rows = pattern.meetingpatterndetail_set == null ? [] : list(pattern.meetingpatterndetail_set, 100);
          if (!rows.length) warnings.add(`${label}：上课时间待定，已跳过该安排；请在 Vergil 更新后重新同步。`);
          const room = location(detail.room);
          if (!room) warnings.add(`${label}：教室待定，事件暂不含地点；请在 Vergil 更新后重新同步。`);
          // ponytail: identical ID-less patterns use occurrence order; upstream IDs are needed to distinguish their reordering.
          const fallback = `${startDate}/${endDate}/${rows.map(row => text(object(row).week_day, 10)).sort().join(',')}`;
          const ordinal = fallbackCounts.get(fallback) ?? 0;
          fallbackCounts.set(fallback, ordinal + 1);
          const detailId = identity(detail.id ?? detail.meeting_detail_id) || `pattern:${fallback}:${ordinal}`;
          const dayCounts = new Map<number, number>();
          for (const rawRow of rows) {
            const row = object(rawRow);
            if (pending(row.week_day) || pending(row.from_time) || pending(row.to_time)) {
              warnings.add(`${label}：部分上课时间待定，已跳过该安排；请在 Vergil 更新后重新同步。`);
              continue;
            }
            const day = WEEKDAYS[text(row.week_day, 10)];
            if (typeof day !== 'number') invalid();
            const startTime = time(row.from_time);
            const endTime = time(row.to_time);
            if (startTime === endTime) invalid();
            const dayOrdinal = dayCounts.get(day) ?? 0;
            dayCounts.set(day, dayOrdinal + 1);
            const rowId = identity(row.id ?? row.meeting_pattern_detail_id) || `day:${day}:${dayOrdinal}`;
            const meetingId = JSON.stringify([detailId, rowId]);
            if (meetingIds.has(meetingId)) invalid();
            meetingIds.add(meetingId);
            course.meetings.push({ id: meetingId, startDate, endDate, days: [day], startTime, endTime, location: room });
          }
        }
      }
      courses.push(course);
    }
  }
  if (found.size !== registeredIds.size) {
    throw new CalendarDataError('未能读取全部已选课程，未更新日历。请刷新 Vergil 后重试。');
  }
  return { courses: courses.sort((a, b) => a.id.localeCompare(b.id)), warnings: [...warnings] };
}

function localParts(timestamp: number): string {
  const parts = Object.fromEntries(zone.formatToParts(timestamp).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function utc(localDate: string, localTime: string): number {
  const target = `${localDate}T${localTime}`;
  const naive = Date.parse(target + 'Z');
  const offsets = new Set([-DAY, DAY].map(delta => Date.parse(localParts(naive + delta) + 'Z') - (naive + delta)));
  // RFC 5545 selects the first occurrence of a repeated local time at the fall DST transition.
  const candidates = [...offsets].map(offset => naive - offset).filter(candidate => localParts(candidate) === target);
  if (!candidates.length) throw new CalendarDataError('课表包含夏令时切换时不存在的纽约时间，未更新日历。请核对上课时间。');
  return Math.min(...candidates);
}

function stamp(timestamp: number): string {
  return new Date(timestamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function fold(line: string): string {
  const encoder = new TextEncoder();
  let result = '';
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > 75) {
      result += '\r\n ';
      octets = 1;
    }
    result += char;
    octets += size;
  }
  return result;
}

export function generateCalendar(input: {
  calendarId: string; title: string; courses: Course[]; excludedDates: string[]; updatedAt: string;
}): { ics: string; eventCount: number } {
  const calendarId = identity(input.calendarId);
  if (!calendarId) invalid();
  const title = text(input.title);
  const updatedAt = Date.parse(input.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt < 0 || updatedAt / 1000 > 2_147_483_647) invalid();
  const timestamp = stamp(updatedAt);
  const excluded = new Set(list(input.excludedDates, 366).map(date));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Vergil Calendar Subscriptions//EN',
    'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escapeText(title)}`, 'X-WR-TIMEZONE:America/New_York'];
  let eventCount = 0;
  let contentLength = 0;
  const courseIds = new Set<string>();
  let expandedDays = 0;
  for (const rawCourse of list(input.courses, 500)) {
    const course = object(rawCourse) as unknown as Course;
    const courseId = identity(course.id);
    if (!courseId || courseIds.has(courseId)) invalid();
    courseIds.add(courseId);
    const summary = [text(course.code), text(course.title), text(course.section) ? `(${text(course.section)})` : ''].filter(Boolean).join(' ');
    const meetingIds = new Set<string>();
    for (const rawMeeting of list(course.meetings, 1000)) {
      const meeting = object(rawMeeting) as unknown as Meeting;
      const meetingId = text(meeting.id, 2000);
      if (!meetingId || meetingIds.has(meetingId)) invalid();
      meetingIds.add(meetingId);
      const start = Date.parse(date(meeting.startDate));
      const end = Date.parse(date(meeting.endDate));
      if (end < start || end - start > 366 * DAY) invalid();
      const days = list(meeting.days, 7);
      if (!days.length || days.some(day => typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6)) invalid();
      const startTime = time(meeting.startTime);
      const endTime = time(meeting.endTime);
      if (startTime === endTime) invalid();
      const room = text(meeting.location);
      expandedDays += (end - start) / DAY + 1;
      if (expandedDays > 100_000) invalid();
      for (let cursor = start; cursor <= end; cursor += DAY) {
        const localDate = new Date(cursor).toISOString().slice(0, 10);
        if (!days.includes(new Date(cursor).getUTCDay()) || excluded.has(localDate)) continue;
        if (++eventCount > 20_000) invalid();
        const endDate = new Date(cursor + (endTime < startTime ? DAY : 0)).toISOString().slice(0, 10);
        const startUtc = utc(localDate, startTime);
        const endUtc = utc(endDate, endTime);
        if (endUtc <= startUtc) invalid();
        const uid = [calendarId, courseId, meetingId, localDate].map(encodeURIComponent).join('/') + '@vergil-cal-subs';
        contentLength += uid.length + summary.length + room.length + 250;
        if (contentLength > 2_000_000) invalid();
        lines.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${timestamp}`, `LAST-MODIFIED:${timestamp}`,
          `SEQUENCE:${Math.floor(updatedAt / 1000)}`, `DTSTART:${stamp(startUtc)}`, `DTEND:${stamp(endUtc)}`,
          `SUMMARY:${escapeText(summary)}`, `LOCATION:${escapeText(room)}`, 'END:VEVENT');
      }
    }
  }
  lines.push('END:VCALENDAR');
  return { ics: lines.map(fold).join('\r\n') + '\r\n', eventCount };
}

export function generateSemesterCalendar(calendarId: string, title: string, semesters: CalendarSemester[]) {
  if (!semesters.length || new Set(semesters.map(semester => semester.term)).size !== semesters.length || semesters.reduce((count, semester) => count + semester.courses.length, 0) > 500) invalid();
  const calendars = semesters.map(semester => generateCalendar({ calendarId, title, ...semester }));
  // These documents are generated above, never parsed from an uploaded ICS.
  const header = calendars[0]!.ics.split(/(?<=\r\n)(?:BEGIN:VEVENT|END:VCALENDAR)\r\n/)[0]!;
  const events = calendars.map(calendar => {
    const start = calendar.ics.indexOf('\r\nBEGIN:VEVENT\r\n');
    return start < 0 ? '' : calendar.ics.slice(start + 2, -'END:VCALENDAR\r\n'.length);
  }).join('');
  const ics = `${header}${events}END:VCALENDAR\r\n`;
  const eventCount = calendars.reduce((count, calendar) => count + calendar.eventCount, 0);
  if (eventCount > 20_000 || new TextEncoder().encode(ics).length > 2_000_000) invalid();
  return { ics, eventCount };
}
