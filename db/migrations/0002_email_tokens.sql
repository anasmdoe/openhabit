-- Email verification and password reset (auth-service).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
-- accounts created through SSO were vouched for by the identity provider
UPDATE users SET email_verified_at = created_at WHERE oidc_sub IS NOT NULL AND email_verified_at IS NULL;

-- One-time links. Only a SHA-256 of the token is stored.
CREATE TABLE IF NOT EXISTS email_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind       TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
  email      TEXT NOT NULL,                 -- the address the link was sent to
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_tokens_user_idx ON email_tokens (user_id, kind);
GRANT SELECT, INSERT, UPDATE, DELETE ON email_tokens TO auth_svc;
