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
