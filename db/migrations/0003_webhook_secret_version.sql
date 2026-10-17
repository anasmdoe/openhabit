-- Signed webhooks: each user's signing secret is derived from JWT_SECRET, the user id and this version.
-- Bumping the version (auth-service: POST /auth/webhook-secret/rotate) replaces the secret.
ALTER TABLE users ADD COLUMN IF NOT EXISTS webhook_secret_version INTEGER NOT NULL DEFAULT 1;
