-- Streak protection: how many missed days per calendar month may be "frozen" (kept out of the streak)
-- for a daily habit. 0 turns it off. The freezes themselves are not stored: they are derived from the
-- entries, so editing a past day always gives a consistent answer.
ALTER TABLE habits ADD COLUMN IF NOT EXISTS streak_freezes SMALLINT NOT NULL DEFAULT 1
  CHECK (streak_freezes BETWEEN 0 AND 3);
