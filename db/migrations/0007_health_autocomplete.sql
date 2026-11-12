-- Automatic completion from phone health data (Health Connect on Android, Apple Health via Shortcuts).
-- A habit names one daily metric; the phone sends daily totals to POST /wellness/health-sync and the
-- tracking service applies the rule. yes/no habits are done when the metric reaches auto_threshold;
-- measurable habits take the metric as their value. Manual entries are never lowered or replaced.
ALTER TABLE habits ADD COLUMN IF NOT EXISTS auto_metric TEXT NOT NULL DEFAULT '';
ALTER TABLE habits ADD COLUMN IF NOT EXISTS auto_threshold NUMERIC;

DO $$ BEGIN
  ALTER TABLE habits ADD CONSTRAINT habits_auto_metric_chk CHECK (auto_metric IN
    ('', 'steps', 'exercise_minutes', 'sleep_hours', 'mindful_minutes', 'distance_km', 'active_kcal', 'water_ml'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
