# OpenHabit

Self-hosted habit tracking with a minimal, Loop-Habit-Tracker-inspired UI —
a distraction-free habit grid, per-habit progress rings, monthly dashboards,
and mood + sleep tracking. Fully responsive down to phone screens. Built as
microservices for Kubernetes homelabs.

```
                        ┌────────────────────────────────────┐
                        │   Ingress (k8s) / gateway (compose) │
                        └──────┬─────────────┬────────────────┘
              /                │  /api/habits│  /api/entries      /api/analytics
        ┌───────────┐   ┌──────┴──────┐ ┌────┴──────────┐ ┌───────┴─────────┐
        │ frontend  │   │habit-service│ │tracking-service│ │analytics-service│
        │ React+nginx│  │  :3001      │ │  :3002         │ │  :3003          │
        └───────────┘   └──────┬──────┘ └────┬───────────┘ └───────┬─────────┘
                               │             │                     │ (read-only)
                               └─────────┬───┴─────────────────────┘
                                    ┌────┴─────┐
                                    │ Postgres │
                                    └──────────┘
```

| Service | Port | Owns | Endpoints |
|---|---|---|---|
| **auth-service** | 3004 (+ OIDC/SSO) | `users` table | `/auth/register`, `/auth/login`, `/auth/me` |
| **social-service** | 3005 | groups, invites, shares, reactions | `/groups`, `/invites`, `/join`, `/reactions` |
| **reminder-service** | 3006 | — (read-only) | internal: minute tick → ntfy pushes |
| **habit-service** | 3001 | `habits` table | CRUD `/habits`, `/habits/reorder` |
| **tracking-service** | 3002 | `entries`, `wellness` | `/entries` (+ `/bulk`), `/wellness` |
| **analytics-service** | 3003 | read-only | `/analytics/overview`, `/analytics/habits/:id` |
| **frontend** | 80 | — | React SPA (nginx) |

Each service is an independent Node 22 + Express app with its own Dockerfile and
least-privilege database role. They share one Postgres instance with per-service
table ownership — a pragmatic homelab middle ground (swap in one DB per service
if you want stricter isolation).

The frontend auto-detects the backend: if `/api` isn't reachable it falls back to
a **demo mode** with localStorage and generated sample data, so you can also open
it standalone.

## Features

- **Multi-user accounts** — register/login with email + password (scrypt-hashed),
  stateless JWT sessions verified independently by every service, per-user data
  isolation enforced in every query, login rate limiting (10 attempts / 15 min),
  password change and full account deletion (cascades to all data). Set `ALLOW_REGISTRATION=false` on auth-service to
  close signups once your household has accounts. Demo mode (no backend) skips
  auth entirely.
- **Three themes** — dark, pitch black (OLED), light; cycle from the toolbar
- **Month navigation** — the habit grid shows one calendar month with ‹ › arrows
  (auto-scrolls to today); drag habits to reorder (order syncs to every panel);
  drag the column divider to resize habit names (great on phones) and the strip
  below the grid to resize list height — both remembered per device
- **Habit icons** — pick from a minimal built-in SVG set when creating/editing
- **Share cards** — export Monthly completion / Current streaks as a branded
  PNG via the native share sheet (or download) for social media
- **PWA + offline** — installable app; the shell works offline and any entries,
  skips, notes, or wellness logged while offline are queued locally and synced
  automatically when the connection returns
- **Skip days** — tap a done checkmark again (or right-click / long-press any
  cell) to mark a day as skipped: it's excused from goals and your streak is
  preserved (`value = -1` in the API). Sick days shouldn't cost you a streak.
- **Flexible schedules** — habits can be fixed weekdays or "N times per week,
  any days" (weekly quotas are prorated at month edges; streaks count in weeks)
- **Notes on entries** — right-click or long-press a cell to jot a note; a dot
  marks noted days
- **Year heatmap** — GitHub-style 365-day activity view in every habit's detail
- **Insights** — your wellness data correlated with your habits: average mood on
  done vs missed days per habit, and completion rate by sleep bucket
- **Completion webhooks** — per-habit URL that receives a POST whenever the
  habit is completed. Point it at an ntfy topic (`https://ntfy.sh/your-topic`)
  for instant push notifications, or at Home Assistant for automations.
- **Reminders (ntfy)** — set an ntfy topic once in your profile and a reminder
  time per habit; the reminder-service checks every minute (in *your* timezone,
  auto-detected by the app) and nudges only when the habit is due and not yet
  logged. Completed, skipped, and quota-met habits stay silent; one reminder
  per habit per day. Subscribe to the same topic in the ntfy mobile app for
  push notifications. Self-hosted ntfy works too — any http(s) topic URL.
- **Milestones & templates** — confetti + share card at 7/30/100/365-day
  streaks; first-run template packs (Morning routine, Fitness base, Digital detox)
- **Export & import** — download your entire dataset as JSON (habits, entries
  incl. skips and notes, wellness) or entries as CSV from the account menu, and
  restore it on any instance: habits are matched by name (existing ones merge,
  new ones are created) and re-imports are safe (upserts, no duplicates)
- **Groups (collaboration)** — create a group, invite people by email or a
  share code/link, and see everyone's progress on a shared dashboard with a
  monthly leaderboard. Privacy is **per-habit and opt-in**: joining a group
  shares nothing until you tick which habits it can see, and others only ever
  see your streak, month %, and a 7-day strip — never your notes or raw
  calendar. A **milestone feed** celebrates streak crossings (7/30/100/365
  days, or 4/12/26/52 weeks for flexible habits) from the last two weeks —
  computed from entries, never announcing misses. Cheer teammates with
  🔥 👏 💪 🎉 reactions; new cheers badge the toolbar bell. (API mode only.)
- **Group habits** — a shared streak the whole group tracks together (e.g.
  "No takeout"). The combined streak only advances when everyone checks in;
  a member's skip is *excused* (sick/travelling won't break it), a genuine
  miss on a past day resets it, and today never breaks until it's over.
  Newcomers are only counted from their join date, so joining can't erase the
  group's history. Crossings surface in the milestone feed as "Everyone hit a
  7-day streak". (v1: yes/no, every day.)
- **Single sign-on (OIDC)** — optional "Sign in with SSO" using any OpenID
  Connect provider (Authelia, Authentik, Keycloak, Zitadel, Google, …). SSO
  users are created on first login; an existing password account with the same
  email is linked automatically. Set `OIDC_*` env vars (compose) or the
  `auth-config` ConfigMap + `auth-oidc` Secret (k8s) to enable it; leave them
  unset and nothing changes. Pair with `ALLOW_REGISTRATION=false` for an
  SSO-only instance. RS256 (JWKS) and HS256 ID tokens are both verified
  (issuer, audience, expiry, and nonce all checked).
- **Loop Habit Tracker import** — migrating from Loop? Export your data and use
  "Import from Loop (CSV)…" in the account menu. The importer reads Loop's
  Checkmarks.csv matrix, auto-detects yes/no vs numeric habits, unscales Loop's
  ×1000 numeric values, matches habits by name (creating any missing), and
  upserts every check-in — so re-running it is safe.
- **Minimal home** — no app chrome, no banners: just the habit grid (most recent
  days first, uhabits style) with a monthly progress ring in front of every name.
  Day columns adapt to screen width (14 on desktop, ~4 on phones).
- **Monthly dashboards** below the grid: today / month / best-streak stat cards,
  day-by-day trend, per-habit monthly completion, current streaks, wellness chart
- **Habit types**: yes/no and measurable (unit + target, at-least or at-most)
- **Scheduling**: per-weekday active days (e.g. gym only Mon–Sat)
- **Detail view** (full-screen on mobile): score & history charts with
  Day/Week/Month/Quarter/Year toggles (Day hidden for yes/no habits), target
  progress bars for numeric habits, a compact 3-month calendar, best-streak
  bars, and frequency by weekday
- Wellness logging (mood 1–5, hours of sleep) straight from the dashboard
- Dark / light theme, keyboard-focus visible, reduced-motion respected

## Local development (no Docker)

```bash
# 1. Postgres with schema
createdb openhabit && psql openhabit < db/init.sql

# 2. Services (each in its own terminal, or use a process manager)
cd services/habit-service     && npm i && npm start   # :3001
cd services/tracking-service  && npm i && npm start   # :3002
cd services/analytics-service && npm i && npm start   # :3003
# DATABASE_URL defaults to postgres://openhabit:openhabit@localhost:5432/openhabit

# 3. Frontend with API proxy
cd frontend && npm i && npm run dev                   # :5173
```

## Docker Compose

Prerequisites: Docker Desktop, or Docker Engine ≥ 24 with the compose plugin
(`docker compose version` should work).

```bash
# 0. Pick a JWT secret (any long random string; all services must share it)
export JWT_SECRET=$(openssl rand -base64 48)

# 1. Build all five images and start the stack
docker compose up --build -d

# 2. Watch until everything is healthy/running
docker compose ps
docker compose logs -f          # ctrl-c to stop following

# 3. Open the app
#    http://localhost:8080  (badge in the top-left panel should say LIVE)

# 4. Create your account in the UI, or load demo data:
docker compose run --rm seed     # creates demo@home.lab / demo-password-123
```

> **Upgrading an existing install?** Schema changes are applied without data
> loss: `docker compose up --build -d && docker compose run --rm migrate`
> (the init script is idempotent — it creates missing tables/columns and
> leaves your data alone). On k8s: re-apply manifests, then run
> `kubectl apply -f k8s/90-migrate-job.yaml`.
> Only pre-auth (single-user) versions require a reset (`down -v`), because
> per-user scoping changed row ownership.

Day-to-day commands:

```bash
docker compose stop                      # stop, keep containers + data
docker compose start                     # resume
docker compose down                      # remove containers, keep data volume
docker compose down -v                   # ALSO wipe the database
docker compose up -d --build habit-service   # rebuild one service after edits
docker compose logs -f analytics-service     # tail one service
docker compose exec postgres psql -U openhabit   # SQL shell
```

Troubleshooting:

- **Port 8080 busy** — change the gateway mapping in `docker-compose.yml`
  (e.g. `"9090:8080"`) and open `http://localhost:9090`.
- **Badge says DEMO instead of LIVE** — the frontend couldn't reach `/api/habits`;
  check `docker compose ps` for a crashed service and its logs.
- **`init.sql` changes not applying** — the schema only runs on first boot of the
  data volume: `docker compose down -v && docker compose up -d --build`.
- **Seed fails with ECONNREFUSED** — the gateway wasn't up yet; wait a few
  seconds and rerun `docker compose run --rm seed`.
- Services wait for Postgres via a healthcheck, so slow first boots are normal
  (image pulls + `npm ci` in the builds).

## Backups & restore

Your data lives in one Postgres volume; back it up. Dumps are gzipped
`pg_dump` output taken with `--clean --if-exists`, so each one is a complete,
self-contained snapshot you can restore over an existing database.

**Docker Compose — one-off or cron:**

```bash
# Simplest: a one-shot backup into ./backups (keeps the newest 14)
docker compose run --rm backup

# Or use the host script (same output, nicer for cron/systemd):
./scripts/backup.sh
BACKUP_KEEP=30 ./scripts/backup.sh          # keep 30 instead of 14

# Nightly at 02:30 via the host crontab:
#   30 2 * * * cd /path/to/openhabit && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Restore a specific dump (this **overwrites** the current database and asks you
to confirm; app services are paused during the restore):

```bash
./scripts/restore.sh backups/openhabit-20260110-023000.sql.gz
```

**Kubernetes — nightly CronJob:**

```bash
kubectl apply -f k8s/95-backup-cronjob.yaml   # PVC + nightly CronJob (02:30, keep 14)

# Run one immediately instead of waiting for the schedule:
kubectl -n openhabit create job --from=cronjob/postgres-backup backup-now

# List what's on the backup volume (any pod that mounts it works):
kubectl -n openhabit exec deploy/auth-service -- ls -1 /backups 2>/dev/null || \
  echo "mount the postgres-backups PVC into a debug pod to browse it"

# Restore a dump into the running database:
kubectl -n openhabit exec -i statefulset/postgres -- \
  sh -c 'gzip -dc | psql -U openhabit -d openhabit' < path/to/openhabit-YYYYMMDD-HHMMSS.sql.gz
```

Notes: dumps are written atomically (`.partial` then renamed) and integrity-checked
with `gzip -t` before older ones are rotated away, so a crashed dump can never
evict a good one. The backup PVC is separate from the database PVC — for real
off-box safety, sync it elsewhere (e.g. a `restic`/`rclone` sidecar or a host
cron copying `./backups` to remote storage). Backups are excluded from git via
`.gitignore`.

## Kubernetes homelab

```bash
# 1. Build and push images to a registry your cluster can pull from
for s in habit-service tracking-service analytics-service; do
  docker build -t <registry>/openhabit/$s:latest services/$s
  docker push <registry>/openhabit/$s:latest
done
docker build -t <registry>/openhabit/frontend:latest frontend
docker push <registry>/openhabit/frontend:latest
# then update the image: fields in k8s/*.yaml

# 2. Review the two marked values:
#    - k8s/10-postgres.yaml   -> POSTGRES_PASSWORD
#    - k8s/15-app-secrets.yaml -> JWT_SECRET
#    - k8s/40-ingress.yaml    -> host (default habits.home.lab)

# 3. Apply in order
kubectl apply -f k8s/

# 4. Point DNS (or /etc/hosts) at your ingress and open http://habits.home.lab
node db/seed.js http://habits.home.lab/api   # optional demo data
```

Notes for the cluster:

- Postgres is a single-replica StatefulSet with a 2 Gi PVC — fine for a homelab;
  swap for CloudNativePG or an external DB if you want HA.
- Services have readiness/liveness probes on `/healthz` and small resource
  requests; scale replicas freely — they're stateless.
- The Ingress assumes **ingress-nginx** (uses its regex rewrite). For Traefik,
  replace the API Ingress with a `Middleware` strip-prefix equivalent.
- `kubectl apply -f k8s/` includes the nightly backup CronJob
  (`95-backup-cronjob.yaml`) and its dedicated PVC. See **Backups & restore**
  above for running one on demand and restoring; adjust the `schedule` and
  `BACKUP_KEEP` in that file to taste.

## Repository layout

```
├── frontend/                 # React 18 + Vite + Tailwind SPA
├── services/
│   ├── auth-service/         # register/login, JWT, profile (ntfy, timezone)
│   ├── habit-service/        # habits CRUD (schedules, reminders, webhooks)
│   ├── tracking-service/     # entries (+ skips, notes) + wellness
│   ├── analytics-service/    # stats, streaks, insights, group dashboards
│   ├── social-service/       # groups, invites, sharing, reactions, group habits
│   └── reminder-service/     # minute tick -> ntfy reminders (read-only)
├── db/
│   ├── init.sql              # schema + per-service roles (idempotent migration)
│   └── seed.js               # demo data via the public API
├── scripts/
│   ├── backup.sh             # compose backup (gzip pg_dump + rotation)
│   └── restore.sh            # compose restore (confirms before overwrite)
├── gateway/nginx.conf        # compose entrypoint (Ingress mirror)
├── k8s/                      # numbered manifests, apply in order
│                             #   90-migrate-job, 95-backup-cronjob included
└── docker-compose.yml        # + tools profile: seed, migrate, backup
```

## API quick reference

```
POST   /api/auth/register              {email, password, name?} -> {token, user}
POST   /api/auth/login                 {email, password} -> {token, user}
GET    /api/auth/me                    current user
PUT    /api/auth/me                    {name?} and/or {currentPassword, newPassword}
DELETE /api/auth/me                    {password} — deletes account + all data

All routes below require:  Authorization: Bearer <token>

GET    /api/habits                     list
POST   /api/habits                     create {name, question?, type?, unit?, target?, targetType?, color?, activeDays?}
PUT    /api/habits/:id                 partial update (incl. archived)
DELETE /api/habits/:id
PUT    /api/habits/reorder             {ids: [...]}

GET    /api/entries?from&to[&habitId]
PUT    /api/entries                    upsert {habitId, date, value, notes?}
DELETE /api/entries/:habitId/:date
POST   /api/entries/bulk               {entries: [...]}

GET    /api/wellness?from&to
PUT    /api/wellness                   upsert {date, mood?, sleepHours?}

GET    /api/analytics/overview?year&month
GET    /api/analytics/habits/:id
```

Conventions: dates are `YYYY-MM-DD`; weekdays are `0=Sunday … 6=Saturday`;
a habit's *effective start* is `min(created_at, first entry)` so imported or
backfilled history always counts.

## Observability (metrics)

Every service exposes a Prometheus `/metrics` endpoint (internal only — the
gateway does not proxy it). Metrics include per-route request counts, a latency
histogram, in-flight requests, Postgres pool gauges, a `openhabit_pg_up` probe,
and process memory/uptime. The reminder-service adds tick counters and a
`openhabit_reminder_last_tick_timestamp` gauge so you can alert if the loop
stalls (e.g. `time() - openhabit_reminder_last_tick_timestamp > 300`).

Route labels are bounded: path parameters collapse to `:id` and unmatched paths
collapse to `<unmatched>`, so scanners and 404s can't explode cardinality. No
tokens, emails, or other PII ever appear in labels.

**Docker Compose** — bring up Prometheus + Grafana (pre-provisioned with a
datasource and the "OpenHabit — Services" dashboard):
```bash
docker compose --profile monitoring up -d
```
Grafana: http://localhost:3030 (admin/admin by default — override with
`GRAFANA_USER` / `GRAFANA_PASSWORD`). Prometheus: http://localhost:9090.

**Kubernetes** — each Service carries `prometheus.io/scrape` annotations, so an
existing cluster Prometheus discovers them automatically. For a self-contained
setup, `kubectl apply -f k8s/50-monitoring.yaml` deploys a minimal Prometheus
(with RBAC for endpoint discovery) and Grafana.
