CREATE TABLE calendars (
  id TEXT PRIMARY KEY NOT NULL,
  management_hash TEXT NOT NULL,
  subject_hash TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  ics TEXT NOT NULL,
  etag TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);
