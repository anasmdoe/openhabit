# Do we need an Android app?

*Decision record, October 2026. Revisit when one of the triggers below is hit.*

**Short answer: not yet.** OpenHabit's mobile needs — check in quickly, get
reminded, act on the reminder — are met by the installable web app (PWA) plus
push notifications. A native app becomes worth its cost only for the specific
capabilities listed under *Triggers*.

## What users need on a phone, and what covers it today

| Need | Today | Gap |
|---|---|---|
| Open the app like an app (icon, full screen) | PWA: "Add to Home screen", `display: standalone`, offline cache | Icons are SVG only; add 192/512 px PNGs for every installer |
| Check in quickly | Responsive UI, offline queue | — |
| Get reminded | ntfy push (per-user topic) | Needs the third-party ntfy app |
| Act on a reminder without opening the app | ntfy buttons: **Done · Snooze 30 min · Open** (signed links, no login) | Same as above |
| Data ownership / self-hosting | Same code on docker, k8s, AWS | — |

## Options

| | PWA + ntfy (now) | PWA + Web Push | Play Store via TWA | Native (Capacitor / React Native) |
|---|---|---|---|---|
| Extra code | none | ~400 lines, zero deps | thin wrapper (Bubblewrap) | new app shell + plugins, ongoing |
| Third-party app needed | ntfy | none | none | none |
| Android notification buttons | yes | yes | yes | yes |
| iPhone | ntfy app (buttons work) | Home-Screen web apps only, iOS 16.4+; custom buttons unreliable | no (Android only) | yes, separate build and App Store review |
| Store presence | no | no | Google Play | both stores |
| Home-screen widgets, Health Connect, background work | no | no | no | yes |
| Ongoing cost | none | none | Play account, yearly target-SDK bumps | two platforms, store reviews, SDK churn |

## Recommendation

1. **Now:** keep ntfy (works on both platforms, no account needed, self-hostable).
2. **Next:** add **Web Push** to the PWA, so Android users need no extra app and
   get the same Done / Snooze buttons; keep ntfy for iPhone and power users.
   Add PNG icons for installability.
3. **When store presence matters:** wrap the same PWA as a **Trusted Web
   Activity** (Bubblewrap). Mind Google Play's target-SDK rule (API 36 for new
   apps and updates from 31 Aug 2026) — check the template targets it.
4. **Native only on a trigger** below, using Capacitor so the React UI and
   `lib/stats.ts` are reused.

## Triggers for a native app

- Home-screen **widgets** with one-tap check-ins (the most requested habit-app feature).
- **Health Connect / step-count** habits that track themselves.
- **Fully offline-first** use with background sync of everything, not just a queue.
- Reminders that must fire **without any server** (local scheduling).
- iPhone users who need reliable action buttons and won't install ntfy.
