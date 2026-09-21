-- Fail without deleting data if an older deployment has duplicate owner rows.
CREATE UNIQUE INDEX calendars_subject_hash ON calendars (subject_hash);
ALTER TABLE calendars ADD COLUMN feed_id TEXT;
UPDATE calendars SET feed_id = id;
CREATE UNIQUE INDEX calendars_feed_id ON calendars (feed_id);
-- Keep inserts from the previous Worker valid during a rolling deployment.
CREATE TRIGGER calendars_default_feed_id AFTER INSERT ON calendars
WHEN NEW.feed_id IS NULL
BEGIN
  UPDATE calendars SET feed_id = NEW.id WHERE id = NEW.id;
END;
