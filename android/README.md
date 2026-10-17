# OpenHabit for Android: home-screen widget

A small native app whose job is the **home-screen widget**: today's habits on your home screen, one tap to check one off.
It talks to your own OpenHabit server with a personal API token, and has no dependencies beyond Android itself.

> **Status: written but not yet built or run.** The environment this was written in cannot reach Google's Android SDK
> downloads, so nothing here has been compiled. The parsing and ordering logic (`TodayParser`) is covered by JVM unit
> tests, and `.github/workflows/android.yml` builds and tests everything on a normal runner. Expect a first-build fix or two.
> The server side it needs (`GET /api/v1/analytics/today`) is tested in the smoke test.

## What it does

- Lists the habits due today, in your order. A habit stacked "after" another sits right behind it, marked `↳`.
- Tap a row: yes/no habits are checked off; numeric habits are set to their target (the same as swiping "Done" in the app).
  Tap a finished row to undo it. The row changes at once and is put back with a message if the server can't be reached.
- Shows progress (`3/7`), streaks, and a refresh button. It refreshes every 30 minutes by itself.
- Quit habits are left out (their entries record slips, not check-ins).

## Reminders with buttons

The notification half of "tap to complete" already exists without this app: reminders sent through **ntfy** or **Web Push**
carry **Done** and **Snooze 30 min** buttons that check the habit in without opening anything. This app does not add a second
notification path.

## Build and install

Needs JDK 17 and the Android SDK (Android Studio brings both). From this folder:

```
gradle test            # unit tests
gradle assembleDebug   # app/build/outputs/apk/debug/app-debug.apk
```

(Or just open `android/` in Android Studio. CI also uploads the debug APK as a build artifact.)

## Set up

1. In the web app: **Account → API tokens**, create a token and copy it.
2. Open the OpenHabit app on the phone, enter your server address (for example `https://habits.example.com`) and the token,
   and press **Save and test**. It tells you how many habits are done today.
3. Long-press the home screen → Widgets → OpenHabit.

The token is stored in the app's private storage. The server address must be HTTPS (cleartext is switched off in the manifest).

## Layout

| File | Purpose |
|---|---|
| `widget/TodayModel.kt` | Parses `/analytics/today`, orders stacked habits, decides what a tap writes (pure, unit-tested) |
| `widget/Api.kt` | The three HTTP calls: today, set value, clear |
| `widget/HabitWidgetProvider.kt` | The widget frame, refresh, tap wiring |
| `widget/HabitWidgetService.kt` | The list rows |
| `widget/ToggleReceiver.kt` | Handles a tap: optimistic update, write, refresh |
| `MainActivity.kt` | Server address and token |
