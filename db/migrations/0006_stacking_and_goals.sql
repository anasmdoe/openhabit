-- Habit stacking: "after <habit>, I will <this habit>". Deleting the anchor habit just unlinks it.
ALTER TABLE habits ADD COLUMN IF NOT EXISTS after_habit_id UUID REFERENCES habits (id) ON DELETE SET NULL;

-- Goals with deadlines: "read 20 books by December". Progress is derived from the linked habit's entries
-- (the sum of its values for a measurable habit, the number of completed days otherwise), never stored.
CREATE TABLE IF NOT EXISTS goals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  habit_id     UUID NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  target       NUMERIC NOT NULL CHECK (target > 0),
  unit         TEXT NOT NULL DEFAULT '',
  start_date   DATE NOT NULL,
  deadline     DATE NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (deadline >= start_date)
);
CREATE INDEX IF NOT EXISTS goals_user_idx ON goals (user_id, deadline);
GRANT SELECT, INSERT, UPDATE, DELETE ON goals TO habit_svc;
GRANT SELECT ON goals TO analytics_svc;
