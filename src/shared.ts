export interface Meeting {
  id: string;
  startDate: string;
  endDate: string;
  /** JavaScript weekday: Sunday = 0, Saturday = 6. */
  days: number[];
  startTime: string;
  endTime: string;
  location: string;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  section: string;
  meetings: Meeting[];
}

export interface SyncRequest {
  accessToken: string;
  refreshToken: string;
  term: string;
  title?: string;
  excludedDates?: string[];
}

export interface CalendarSnapshot {
  id: string;
  title: string;
  term: string;
  updatedAt: string;
  courseCount: number;
  eventCount: number;
  courses: Course[];
  excludedDates: string[];
  warnings: string[];
  feedUrl: string;
}

export interface SyncResponse extends CalendarSnapshot {
  /** Returned only at creation; unrelated to Columbia tokens. */
  managementToken?: string;
  refreshed: boolean;
}

export interface ApiError {
  error: string;
  code: string;
}
