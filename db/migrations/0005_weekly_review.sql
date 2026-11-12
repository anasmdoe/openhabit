-- Weekly review: an opt-in Sunday-evening digest (push, ntfy and email).
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_review BOOLEAN NOT NULL DEFAULT false;

-- One row per user and reviewed week, claimed before sending so replicas and retries never send it twice.
CREATE TABLE IF NOT EXISTS weekly_reviews_sent (
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week_start)
);
GRANT SELECT, INSERT, DELETE ON weekly_reviews_sent TO reminder_svc;
