# ADR 1: How the AWS deployment gets close to zero idle cost

*Status: accepted, October 2026.*

## Problem

On AWS the Lambda functions, API Gateway and EventBridge cost nothing when idle. The database does
not: a `db.t4g.micro` RDS instance is about $13 a month whether anyone logs in or not. We want the
idle bill close to zero without giving up the SQL the services rely on.

## Options

| | Idle cost | First request after idle | Code change | Verdict |
|---|---|---|---|---|
| RDS Postgres (`db_engine = "rds"`) | ~$13/month | none | none | default; simple, predictable |
| External serverless Postgres (Neon, Supabase), `db_host` | $0 on free tiers | ~1 s | none | already supported; best idle cost, but another vendor |
| **Aurora Serverless v2 with auto-pause** (`db_engine = "aurora-serverless"`) | storage only (~$0.10/GB-month) | ~15 s resume | none | **added**: stays in your AWS account, keeps the SQL and the per-service roles |
| DynamoDB | ~$0 | none | **rewrite of all six services** | not now (below) |

## Why not DynamoDB now

DynamoDB would be the cheapest and fastest option, but the services are written around SQL:

- `analytics-service` computes streaks, scores, weekday and mood correlations, and recaps with joins
  and aggregates across habits, entries and wellness. In DynamoDB each becomes application code over
  several queries, with every access pattern designed up front.
- The six services enforce least privilege through separate Postgres roles and column grants. DynamoDB
  would need IAM conditions (`dynamodb:LeadingKeys`) to give the same isolation.
- The numbered migrations, `init.sql`, the Docker and Kubernetes deployments and the smoke test all
  assume Postgres. A DynamoDB backend would have to sit next to Postgres (the self-hosted paths keep it),
  so every data-access function exists twice and must be tested twice.

That is a multi-week port with a long tail of behaviour differences, to save a bill that Aurora
auto-pause or Neon already removes.

### If we do it later: the data model

One table, `PK`/`SK` strings, GSI1 for lookups by date:

| Item | PK | SK |
|---|---|---|
| User | `USER#<id>` | `PROFILE` |
| Habit | `USER#<id>` | `HABIT#<id>` |
| Entry | `USER#<id>` | `ENTRY#<date>#<habitId>` (GSI1: `HABIT#<id>` / `<date>`) |
| Wellness day | `USER#<id>` | `WELLNESS#<date>` |
| Email/API token | `TOKEN#<hash>` | `TOKEN` |

Reading a month for the dashboard is one `Query` on `USER#<id>` with `SK between ENTRY#2026-10-01 and ENTRY#2026-10-31`.
Group sharing and reminders need GSIs (`GROUP#`, `REMIND#<hh:mm>`). The work starts with a storage
interface in each service so the SQL and DynamoDB implementations run the same test suite.

**Triggers to revisit:** users in the thousands (Postgres connection limits behind Lambda become the
bottleneck, RDS Proxy or DynamoDB), or a requirement for single-digit-millisecond cold paths.

## Consequences of Aurora auto-pause

- The first request after a pause waits ~15 s. Lambda timeouts of 30 s absorb it; the 10 s limit of
  some sandboxes does not (that request fails once, the retry works).
- Anything that opens a connection keeps the database awake, including the reminder check every
  `reminder_interval_minutes`. With a 1-minute interval it never pauses; set the interval to 15 for an
  idle-friendly setup, or accept the minimum 0.5 ACU (~$43/month) of an always-on cluster.
- Aurora Serverless v2 needs engine 16.3 or newer for scale-to-zero. The module asks for major version 16.
- Not verified on a live account: the KodeKloud sandbox denies the `db.serverless` instance class, so the
  module is covered by offline `tofu test` runs only. Try it in a normal account before relying on it.
