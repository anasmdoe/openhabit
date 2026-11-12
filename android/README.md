# OpenHabit for Android: widget, Health Connect, Quick Settings tile and Wear OS

A small native app whose job is the **home-screen widget**: today's habits on your home screen, one tap to check one off.
It talks to your own OpenHabit server with a personal API token, and has no dependencies beyond Android itself.

> **Status: builds in CI, not yet run on a device.** `.github/workflows/android.yml` runs the JVM unit tests
> (parsing, stacking order, tap rules, the Health Connect payload) and builds both APKs, which it uploads as a
> build artifact. The server side (`/analytics/today`, `/wellness/health-sync`) is covered by the smoke test.

## What it does

- **Home-screen widget**: the habits due today in your order (a stacked habit sits right behind its anchor,
  marked `↳`). Tap a row to check it off; numeric habits go to their target; tap again to undo. Progress,
  streaks, a refresh button, and a refresh every 30 minutes. The widget can also go on the **lock screen**
  on devices that allow lock-screen widgets (some tablets and phones on Android 15 and newer).
- **Quick Settings tile** "Habits": `3/7 habits`, and a tap checks off the next open habit. Quick Settings
  opens from the lock screen, so this is the one-tap check-in that works on every phone.
- **Health Connect**: steps, exercise, sleep, distance, active energy and water, read once an hour in the
  background (or when you open the app, if your phone doesn't offer background reads) and sent as daily
  totals to `POST /api/v1/wellness/health-sync`. Habits set to **Complete automatically** in the web app's
  editor are checked off from them; sleep also fills the Patterns panel. Only totals leave the phone, never
  individual records, and the app never writes to Health Connect.
- **Wear OS app** (`wear/`): today's list on the watch with tap-to-complete, and a **complication** for the
  watch face (a ring or `3/7`). It takes its server and token from the phone app over the Wearable Data
  Layer, so nothing is typed on the watch.
- Quit habits are left out everywhere (their entries record slips, not check-ins).

## Reminders with buttons

The notification half of "tap to complete" already exists without this app: reminders sent through **ntfy** or **Web Push**
carry **Done** and **Snooze 30 min** buttons that check the habit in without opening anything. This app does not add a second
notification path.

## Build and install

Needs JDK 17 and the Android SDK (Android Studio brings both). From this folder:

```
gradle test            # unit tests
gradle assembleDebug   # app/build/outputs/apk/debug/app-debug.apk and wear/build/outputs/apk/debug/wear-debug.apk
```

(Or just open `android/` in Android Studio. CI also uploads the debug APK as a build artifact.)

## Set up

1. In the web app: **Account → API tokens**, create a token and copy it.
2. Open the OpenHabit app on the phone, enter your server address (for example `https://habits.example.com`) and the token,
   and press **Save and test**. It tells you how many habits are done today.
3. Long-press the home screen → Widgets → OpenHabit. For the tile: pull down Quick Settings → edit (pencil) → drag *Habits* in.
4. **Health Connect**: press *Connect Health Connect*, allow the data types you want (and "access in the background"
   if offered). The first sync sends the last 30 days. Then, in the web app, set *Complete automatically* on the
   habits that should follow your phone (for example Walk: Steps, done at 8000).
5. **Watch**: install `wear-debug.apk` on the watch (`adb -s <watch> install wear-debug.apk`); press *Save and test*
   on the phone once more and the watch picks up the settings. Add the *Habits today* complication to a watch face.

Install both APKs from the same build: the watch only accepts settings from a phone app signed with the same key.

The token is stored in the app's private storage. The server address must be HTTPS (cleartext is switched off in the manifest).

## Layout

| File | Purpose |
|---|---|
| `core/` | Shared by phone and watch: API client, settings, `TodayParser` (pure, unit-tested) |
| `app/.../widget/` | Home-screen / lock-screen widget, list rows, tap handling |
| `app/.../tile/HabitTileService.kt` | Quick Settings tile |
| `app/.../health/` | Health Connect reader, sync payload (unit-tested), hourly worker |
| `app/.../wear/WearConfig.kt` | Sends server and token to the watch |
| `app/.../MainActivity.kt` | Server, token, Health Connect connection; also the privacy rationale Health Connect shows |
| `wear/` | The Wear OS app, its settings listener and the progress complication |
