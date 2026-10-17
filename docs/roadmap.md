# Roadmap: what users ask habit trackers for

October 2026. This is based on the most-voted requests in the Loop Habit Tracker
(uHabits) discussions, the most-reacted issues of Beaver Habits (a self-hosted
tracker), and reviews of HabitKit, Streaks, Productive, Atoms, Habitica and
HabitNow. Vote counts are upvotes at the time of writing.

## Already in OpenHabit

| Users ask for | Evidence | OpenHabit |
|---|---|---|
| Sync / web / multi-device | Loop: sync 134 votes, desktop 62 | self-hosted web app + offline PWA |
| Notes per day | Loop 27, Beaver #56 | notes on any entry |
| Flexible goals, fair skips | Loop: custom frequency 24, skip lowers score #463 | N per week, skips excluded from goals and score |
| Heatmap, all-habits overview | Loop 12 / 20, HabitKit reviews | year heatmap, month grid, overview panels |
| Strength score + streak together | Loop 54 | detail view shows both; streak flame on Today (new) |
| Reminders that don't nag once done | Loop #1573 | reminders skip logged/skipped/quota-met habits |
| Self-hosting basics | Beaver #61 SSO, #2 sign-up off, #1 Loop import | OIDC, `ALLOW_REGISTRATION`, Loop CSV import, healthchecks |
| API, Home Assistant, Shortcuts | Beaver README | personal API tokens, webhooks, notification actions |
| Mood correlation | Daylio | wellness × habit insights |
| Pure black theme | HabitKit, Loop #1856 | pitch-black theme |

## Added in this round

1. **Categories** (Loop: groups 160 votes, combined group stats 42, tags 30; Beaver #53).
   - A category on each habit.
   - Filter chips that filter Today and the grid.
   - A "By category" panel with the month completion per category.
2. **Quit habits** (Loop: "un-habits" 64, negative habits 34, #2321).
   - Log only the slips. Every other day counts as a win.
   - Clean streak, slips per month, and red ✕ in the grid.
   - Never reminded, and slips don't fire completion webhooks.
3. **Tap to count** (Loop: tap to increment 48, several per day 27).
   - `+1` on measurable habits in Today: glasses of water, pages, sets.
4. **Take a break** (Loop: pause a habit from X to Y 12; vacation and streak-freeze features in Duse, HabitBrix and Do Habits, often paywalled).
   - Skips a date range for chosen habits.
   - Streaks survive and reminders stay quiet.
   - It never overwrites a day you already logged.
5. **Today, redesigned.**
   - An animated progress ring.
   - Full-width rows on phones, so habits are no longer hidden in a sideways scroll.
   - A colour burst on completion, plus haptics.
   - A streak flame on each habit.
   - **"Don't miss twice"**: research shows that one miss does not hurt habit formation, but repeated misses do (Lally et al.). Habits missed yesterday get a gentle nudge.
6. **Home-screen shortcuts** (Loop: widgets 26 / 21): long-press the installed app for *New habit* or *Take a break*. That's the closest a PWA gets to widgets.
7. **Streak fix**: the detail view no longer shows a 0 streak before you tick today.

## Added in round 2

1. **Several reminders per habit** (Loop: multiple reminders 32 votes): up to 3 times a day, each skipped once the habit is logged. One `reminders_sent` row per time slot, so replicas and restarts still never double-send.
2. **When & where cue** (implementation intentions; Atoms): shown under the habit on Today and appended to its reminder.
3. **Feedback settings** (Loop: sound 12 votes; Simple Streak added a haptics setting): optional completion chime, and haptics skipped when the OS asks for reduced motion.
4. **Hide completed** on Today (Loop #2070).

## Added in round 3

1. **Bottom tab bar on phones** (Today / Habits / Stats / Groups): the long single page is now three focused views; desktop is unchanged.
2. **Week view** in the habit grid: seven days that fit a phone without sideways scrolling, alongside the month view.
3. **Swipe on Today rows**: right to log (or undo), left to skip.
4. **First-run checklist**: add habits, turn on reminders, install the app.
5. **Empty and loading states** on Today (no habits yet, rest day, skeleton while loading).
6. **OpenAPI 3.1 document** at `/openapi.yaml`, with a CI check that it matches the routes the services register.

## Dashboard review (October 2026)

Compared with Habitify, HabitKit, Daylio, Loop, Bearable, Exist, TickTick and Beaver Habits. Evidence for the commercial apps comes from store listings, reviews and vendor blogs, not from opening their screens, so treat the "who has it" column as claims.

**What we already match:** a glanceable top line (Today ring, four stat cards), per-habit heatmap and strength score (Loop-style), weekday frequency per habit, mood/sleep insights, shareable cards, month and week grids.

**Gaps, ranked by evidence and effort:**

| # | Add | Why | Size |
|---|---|---|---|
| 1 | Trend deltas on the stat cards ("+8 pts vs last week") | Every recap compares with the previous period | S |
| 2 | Weekly and monthly recap: best and worst habit, best day, 1–2 written sentences | Daylio, Habitify, HabitKit | M |
| 3 | Best/worst weekday across all habits | Habitify; we only have it per habit | S |
| 4 | Target-aware completion for "N per week" habits (3 of 3 = 100%) | TickTick; check our flexible habits | S |
| 5 | Insights as plain sentences, with "need N more days" when data is thin | Daylio; Bearable's minimum-data rule | S–M |
| 6 | Year in pixels coloured by mood | Daylio; we already store mood | S |
| 7 | One calendar of all habits; tap a day to see what was done | Fills our calendar-overview gap | M |
| 8 | Habit-to-habit correlations with a sample-size label | Bearable, Exist; never claim from a few days | M–L |
| 9 | Collapse, hide and reorder dashboard sections | HabitKit layouts; our page is already long | M |
| 10 | Home-screen widgets (a PWA can only offer shortcuts and a compact Today route) | HabitKit, Bearable | L |

**Not copying:** streak-loss punishment, paywalled core analytics, coin and reward economies, correlations from a handful of days, and an ever-longer dashboard.

## Added in round 4

Everything from the dashboard review that fitted, plus tab swiping:

1. **Swipe sideways between tabs** (Today / Habits / Stats / Groups), with Groups as a phone page.
2. **Trend arrows** on the "This month" and "Last 7 days" cards (down is neutral, never red).
3. **Recap** (week / month): percentage and change, best habit, most room, strongest and weakest weekday over four weeks (at least 3 days each, so one Monday never decides), perfect days, plain sentences. Says "not enough days yet" instead of guessing.
4. **Target-aware completion** shared by the cards and the recap: "N per week" habits against their prorated quota, quit habits by clean days, skips excused.
5. **Insights** say what would unlock them ("log your mood on 9 more days").
6. **Year in pixels**, coloured by mood, and an **all-habits calendar** with a per-day list.
7. **Customize Stats**: hide and reorder sections, kept on the device. (Per-section collapse was skipped: hiding covers it.)

Not built from the review: habit-to-habit correlations (needs a careful sample-size rule), native home-screen widgets (not possible in a PWA).

## Added in round 5

1. **Habit window**: summary rates and next milestone, trend and weekday sentences, editable calendar with notes, notes timeline, measurable-habit numbers, quit-habit clean days with optional savings (`savingsPerDay` / `savingsUnit`), quick actions (share card, CSV, pause this habit, reminders).
2. **Undo snackbar** after Today and calendar changes.
3. **Auto theme** that follows the phone, including live changes.
4. **Time-of-day sections** on Today (shown only when habits fall in more than one).
5. **Accessibility pass** with axe-core over every tab, the habit window and the main popups in all three themes; contrast tokens, landmarks, labelled scroll regions and touch targets fixed.

The per-habit mood link already lives in the Trend panel (needs 5 done and 5 missed days with a mood logged).

## Added in round 6

1. **Duration habits**: `min` / `h` units shown as `1h 30m`, with a 5-minute (or quarter-hour) step.
2. **Calendar feed** (iCal URL) of habits due, per user, read-only.
3. **Scheduled export**: `scripts/export-data.js` for cron, with local rotation and optional PUT upload.
4. **Android app inputs** (`twa/`): Bubblewrap manifest, Digital Asset Links example and steps. Not built here (needs the Android SDK and your signing key).
5. **Launcher shortcuts**: `?view=today|habits|stats` opens that tab.

## Added in round 7

1. **Password reset and email verification**, with SMTP / webhook / log transports and a public URL that is never taken from a request.
2. **Numbered database migrations** (`db/migrations`), with checksums, applied identically by psql and by the migrate Lambda.
3. **Secrets in AWS Secrets Manager** (opt-in `use_secrets_manager`).
4. **Playwright browser suite** (`e2e/`) and a **self-hosted GitHub Actions runner in AWS** (`deploy/aws-runner`), including axe-core accessibility scans.
5. Contrast fixes found by the new scans: habit-coloured numbers on panels and the all-habits calendar heat cells.

## Added in round 8

1. **`/api/v1`**: a stable, versioned address for the API, served by the nginx gateway, the Kubernetes ingress and API Gateway; `/api` stays as an alias. The web app and the OpenAPI document use it.
2. **Signed webhooks**: HMAC-SHA256 over `timestamp.body`, per-user secret that can be rotated, delivery ids for de-duplication, verification snippets in the README.
3. **Scale-to-zero database option**: Aurora Serverless v2 (`db_engine = "aurora-serverless"`), plus an architecture decision record on why DynamoDB is deferred and what its data model would be.

## Added in round 9

1. **Real email through Amazon SES** (`mail.transport = "ses"`, `ses_identity`), no SMTP credentials.
2. **CI runner as a persistent spot instance** with a separate encrypted data disk for caches and workspaces.
3. **`db/seed.js`** now creates categories, reminder times, cues and a real quit habit, and can bring an existing demo account up to date.
4. **`scripts/verify-all.sh`**: every check in one PASS/FAIL table, with an optional live-stack pass.

## Added in round 10

1. **Streak protection**: per-habit monthly freezes for daily habits, derived from the entries (nothing stored), shown as snowflakes in the calendar, in the habit overview and on Today.
2. **Weekly review**: an opt-in Sunday-evening digest by push, ntfy and email, with an in-app preview. Shared pure code (`services/_shared/digest.js`, `streaks.js`) so the preview and the notification agree.

## Next candidates, in order

| # | Feature | Why | Size |
|---|---|---|---|
| 1 | Measurable habits: average instead of sum, hours/minutes as duration | Loop: hours unit 34, average 20 | S–M |
| 2 | Scheduled export of your data (daily JSON to S3/WebDAV) | Loop: daily backup export 35 / 63 comments | M |
| 3 | Calendar feed (iCal URL) of today's habits | Beaver ships a CalDAV bridge | S |
| 4 | Android app via TWA, which also unlocks widgets and Health Connect auto-complete | Loop widgets; Habitify added Health Connect in Nov 2025 | L — see [mobile-strategy.md](mobile-strategy.md) |
| 5 | OpenAPI document for the REST API | Beaver #25 | S |
| 6 | DynamoDB storage for the AWS deploy | removes the database's idle cost | L |

## Why people abandon habit apps, and how we avoid it

- **All-or-nothing streaks.** We avoid this with skips, Take a break, the strength score, "don't miss twice", and quit habits that measure progress rather than perfection.
- **Paywalls and caps.** OpenHabit is AGPL, with every feature free and self-hosted.
- **Data loss and lock-in.** We provide JSON/CSV export and import, Loop import, nightly database backups, and Postgres.
- **Nagging notifications.** Reminders are quiet once a habit is logged and honour quiet hours. Snooze and Done work from the notification, and quit habits are never nagged.
