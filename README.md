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
| **reminder-service** | 3006 | `reminders_sent` | minute tick → ntfy pushes; `/reminders/snooze/:token` |
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
  per habit per day, recorded in the database so restarts never double-send
  (and a reminder missed during a restart still goes out within 15 minutes).
  Subscribe to the same topic in the ntfy mobile app for push notifications.
  Self-hosted ntfy works too — any http(s) topic URL.
  - **Quiet hours** (profile) silence reminders in a window such as 22:00–07:00.
  - **Snooze** — set `PUBLIC_URL` (the address your phone uses to reach the
    app) and notifications get *Snooze 30 min* / *Snooze 1 h* buttons. The
    buttons call signed, 24-hour links, so no login is needed on the phone; a
    snoozed reminder is re-sent only if the habit still isn't logged, and
    waits out quiet hours.
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
- **Personal API tokens** — create long-lived tokens in the account menu for
  Shortcuts, NFC tags, cron scripts, and Home Assistant. Tokens are scoped to
  the data plane: they can log entries and read everything, but can never
  change your password, delete the account, or mint more tokens — so a leaked
  automation token can't take over the account. Revoke any token individually;
  "last used" shows which are still alive. Only a SHA-256 hash is stored.
- **Journal** — every note you've jotted on a cell, collected chronologically
  in one reading surface (account menu → Journal).
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
export JWT_SECRET=$(openssl rand -base64 48)          # same value for every service
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
# 0. Create .env with random secrets: the JWT secret shared by all services
#    and one database password per service (re-running never overwrites)
scripts/init-env.sh

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
> loss: `scripts/init-env.sh && docker compose run --rm migrate && docker compose up --build -d`
> (the init script is idempotent — it creates missing tables/columns and
> leaves your data alone; `migrate` also (re)applies the service role
> passwords from `.env`). On k8s: re-apply manifests, then run
> `kubectl apply -f k8s/90-migrate-job.yaml`.
> Only pre-auth (single-user) versions require a reset (`down -v`), because
> per-user scoping changed row ownership.
>
> Installs that never set `JWT_SECRET` were signing logins with a public
> placeholder; services now refuse to start until it is set (see step 0).
> Setting it signs everyone out once.
>
> Services used to connect as the `openhabit` superuser; each now logs in as its
> own least-privilege role (`auth_svc`, `habit_svc`, …) with a password from
> `.env`. `scripts/init-env.sh` adds the six `*_DB_PASSWORD` values to an
> existing `.env`, and `migrate` applies them to the database — run both before
> `up`, as above.

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
# then re-apply the per-service grants (dumps carry none) with the migrate Job:
kubectl -n openhabit delete job db-migrate --ignore-not-found
kubectl apply -f k8s/90-migrate-job.yaml
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

# 2. Review the marked values (services refuse "change-me" placeholders):
#    - k8s/10-postgres.yaml   -> POSTGRES_PASSWORD, and the six db-role-passwords
#                                (one per service, e.g. `openssl rand -hex 24`)
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

## AWS serverless (pay per use)

For a small instance, always-on containers are wasted money. The same code also
deploys as AWS Lambdas, so with no traffic you pay close to nothing:

```
CloudFront ─┬─ /        → S3 (built frontend, private)
            └─ /api/*   → API Gateway (HTTP API) → one Lambda per service
EventBridge rule (every 5 min) → reminder Lambda
Postgres over TLS (Neon, Supabase, Aiven, … or RDS) — no VPC, so no NAT gateway
```

Every service keeps its Express app; `src/lambda.js` (a copy of
`services/_shared/lambda.js`) replays API Gateway events against it, and
an EventBridge rule replaces the reminder timer. Docker and Kubernetes keep
working unchanged. CI runs the full smoke test through the Lambda handlers and
through the packaged zips.

**Deploy** (needs AWS credentials, the `aws` CLI, OpenTofu or Terraform, and Node):

```bash
scripts/init-env.sh                                        # secrets in .env (same as docker)
# create a Postgres database (e.g. a free Neon project), then in .env:
#   AWS_DB_ADMIN_URL=postgresql://owner:…@ep-….neon.tech/openhabit?sslmode=require
cp deploy/aws/terraform.tfvars.example deploy/aws/terraform.tfvars   # set db_host (pooled host)
scripts/deploy-aws.sh                                      # build → apply (runs migrations) → upload
```

Re-run `scripts/deploy-aws.sh` for every update; it only redeploys Lambdas
whose code changed. `tofu destroy` (or `terraform destroy`) in `deploy/aws`
removes everything except your database.

**Costs and trade-offs**

- Lambda, API Gateway, EventBridge, S3 and CloudFront all bill per
  request; a personal or family instance usually stays within AWS's free tiers
  (check current pricing for your region). API throttling (20 req/s, burst 50)
  caps the bill if someone hammers the API.
- Reminders: each scheduled run queries Postgres. With a scale-to-zero database
  (Neon) a short interval keeps it awake and uses compute hours, so the default
  is every 5 minutes (`reminder_interval_minutes`, 1–15); reminders can then
  arrive up to that late.
- The first request after idle is a cold start (about a second).
- `/metrics`, Prometheus and Grafana don't apply here; use CloudWatch (logs are
  kept 14 days). The login rate limiter is per Lambda container.
- Snooze buttons work out of the box: `PUBLIC_URL` is set to the CloudFront URL.
- SSO: set `oidc` in `terraform.tfvars` (Amazon Cognito works as the provider).
- Next step on the roadmap: a DynamoDB storage backend, which removes the
  database's idle cost entirely.

**Without a separate Postgres, or in a restricted sandbox.** `create_database = true`
creates a small private RDS Postgres; the Lambdas then join the default VPC and
only their security group can reach the database. VPC Lambdas have no internet
access by themselves, so for ntfy pushes, webhooks and SSO set `nat_mode` to
`"instance"` (a t3.micro NAT instance, ~$8/month) or `"gateway"` (managed NAT
gateway, ~$32+/month). Each push is logged (`reminder push habit=… status=…`) in
the reminder Lambda's CloudWatch logs. Database migrations always run from inside AWS
(the `migrate` Lambda, on every apply that changes `db/init.sql`), so no `psql`
is needed. For accounts that deny CloudFront, inline IAM policies, log
retention or tagging, see the sandbox block in `terraform.tfvars.example`
(verified end to end on the KodeKloud AWS playground; `node scripts/smoke-test.js
--url <app_url>` tests a live deployment).

## Repository layout

```
├── frontend/                 # React 18 + Vite + Tailwind SPA
├── services/
│   ├── auth-service/         # register/login, JWT, profile (ntfy, timezone)
│   ├── habit-service/        # habits CRUD (schedules, reminders, webhooks)
│   ├── tracking-service/     # entries (+ skips, notes) + wellness
│   ├── analytics-service/    # stats, streaks, insights, group dashboards
│   ├── social-service/       # groups, invites, sharing, reactions, group habits
│   └── reminder-service/     # minute tick -> ntfy reminders, quiet hours, snooze links
├── db/
│   ├── init.sql              # schema + per-service roles (idempotent migration)
│   └── seed.js               # demo data via the public API
├── scripts/
│   ├── backup.sh             # compose backup (gzip pg_dump + rotation)
│   └── restore.sh            # compose restore (confirms before overwrite)
├── gateway/nginx.conf        # compose entrypoint (Ingress mirror)
├── k8s/                      # numbered manifests, apply in order
│                             #   90-migrate-job, 95-backup-cronjob included
├── deploy/aws/               # Terraform/OpenTofu: Lambda, API Gateway, CloudFront, S3, EventBridge
└── docker-compose.yml        # + tools profile: seed, migrate, backup
```

## API quick reference

```
POST   /api/auth/register              {email, password, name?} -> {token, user}
POST   /api/auth/login                 {email, password} -> {token, user}
GET    /api/auth/me                    current user
PUT    /api/auth/me                    {name?, ntfyUrl?, timezone?, quietStart?, quietEnd?} and/or {currentPassword, newPassword}
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
POST   /api/reminders/snooze/:token     signed link from a notification (no auth header)
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

## Using the API (automations)

Create a token in the account menu → **API tokens**, then call any endpoint
with `Authorization: Bearer oh_...`:

```bash
# list your habits (find the id you want to automate)
curl -s https://habits.example.com/api/habits \
  -H "Authorization: Bearer oh_YOURTOKEN"

# mark a habit done today (the Shortcuts / NFC-tag one-liner)
curl -s -X PUT https://habits.example.com/api/entries \
  -H "Authorization: Bearer oh_YOURTOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"habitId\":\"<id>\",\"date\":\"$(date +%F)\",\"value\":1}"
```

**Apple Shortcuts**: add a "Get Contents of URL" action → URL
`https://<host>/api/entries`, Method PUT, Headers `Authorization: Bearer oh_...`,
Request Body JSON with `habitId`, `date` (Current Date formatted `yyyy-MM-dd`),
and `value: 1`. Save it, say "Hey Siri, <shortcut name>" — or write the
shortcut to an NFC tag via the Shortcuts Automation tab.

Tokens work on all data endpoints (habits, entries, wellness, analytics,
groups) and `GET /api/auth/me`. Account management always requires signing in.

## Alerting

`monitoring/alerts.yml` ships 7 Prometheus rules, preloaded in both the compose
and k8s Prometheus: service down, DB unreachable (per service), reminder loop
stalled (>5 min without a tick), reminder tick errors, 5xx rate >5%, p95
latency >1s, and pg pool saturation. Point Alertmanager (or Grafana alerting)
at them to get notified — an ntfy receiver works nicely here too.

## Tests & CI

```bash
cd frontend && npm test                 # unit tests for streak/score/schedule math
scripts/test-init-sql.sh                # applies db/init.sql twice, proves it is idempotent
node scripts/smoke-test.js              # all services, each as its own DB role, end to end
node scripts/smoke-test.js --lambda     # the same flows through the AWS Lambda handlers
(cd deploy/aws && tofu test)            # Terraform stack, offline with a mocked AWS provider
node scripts/sync-configmap.js          # copy db/ files into k8s/10-postgres.yaml
node scripts/sync-configmap.js --check  # fail if they have drifted
```

The database scripts take the usual `PG*` variables (point them at a throwaway
database); the smoke test also needs the `*_DB_PASSWORD` variables applied with
`db/set-db-passwords.sh` and `npm ci` in each service.

GitHub Actions (`.github/workflows/ci.yml`) runs all of the above on every push
and pull request, plus `npm ci` for every service (catches lockfile drift) and a
Docker build of every image.

## License

OpenHabit is licensed under the [GNU Affero General Public License v3.0](LICENSE).
You may use, modify and self-host it freely; if you run a modified version as a
network service, you must offer its source code to that service's users.
