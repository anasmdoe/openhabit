# iPhone: Apple Health, Siri and the lock screen with Shortcuts

No app needed: the Shortcuts app that comes with every iPhone can read Apple Health and call OpenHabit's API.
Everything below uses a **personal API token** (web app → Account → API tokens → Create). A token can log
entries and read your data, but can't change your password, delete the account or create more tokens.

In every recipe, `SERVER` is your OpenHabit address (for example `https://habits.example.com`) and `TOKEN` is
the token. Put them in **Text** actions at the top of each shortcut so they're easy to change.

## 1. Habits that complete themselves from Apple Health

First, in the web app, open a habit's editor and set **Complete automatically** to a metric: Steps (with
"Done at" 8000, say), Exercise, Sleep, Mindful minutes, Distance, Active energy or Water. Yes/no habits are
done once the day reaches the amount; measurable habits take the day's total as their value. A value you
typed in by hand is never lowered, and a day you skipped stays skipped. Sleep also fills in the day's sleep
for the Patterns panel when you haven't logged it yourself.

Then build the shortcut **Send Health to OpenHabit**:

1. **Find Health Samples** where *Type* is *Steps* and *Start Date* is *Today*.
   → **Calculate Statistics**: *Sum* of *Health Samples*. Rename the result `steps`.
2. **Find Health Samples** where *Type* is *Exercise Minutes* (Apple Exercise Time) and *Start Date* is *Today*.
   → **Calculate Statistics**: *Sum*. Rename it `exercise`.
3. **Find Health Samples** where *Type* is *Sleep*, *Value* is *Asleep* (any stage), and *Start Date* is in the
   last *1 day*. → **Get Details of Health Samples**: *Duration* → **Calculate Statistics**: *Sum* → **Calculate**
   `Sum ÷ 3600` (hours). Rename it `sleep`.
   (Optional, the same way: *Mindful Minutes* → `mindful`, *Walking + Running Distance* in km → `distance`,
   *Active Energy* in kcal → `energy`, *Water* in ml → `water`.)
4. **Format Date**: *Current Date*, *Custom* format `yyyy-MM-dd`. Rename it `date`.
5. **Dictionary** — the `metrics`: keys `steps` (Number) = `steps`, `exercise_minutes` (Number) = `exercise`,
   `sleep_hours` (Number) = `sleep` (and `mindful_minutes`, `distance_km`, `active_kcal`, `water_ml` if you added them).
6. **Dictionary** — one day: `date` (Text) = `date`, `metrics` (Dictionary) = the dictionary from step 5.
7. **List** with that dictionary as its only item.
8. **Get Contents of URL**: `SERVER/api/v1/wellness/health-sync`, *Method* POST,
   *Headers* `Authorization` = `Bearer TOKEN`, *Request Body* JSON with one key `days` (Array) = the list.

Run it once by hand: the response lists the check-ins it made (`applied`). Then automate it:

**Shortcuts → Automation → New Automation → Time of Day** → 21:30, *Daily*, **Run Immediately** → *Send Health
to OpenHabit*. Add a second one at 09:00 if you want last night's sleep in the morning. Sending the same day
twice is safe: values only go up.

## 2. "Hey Siri, log a habit"

Shortcut **Log habit**:

1. **Get Contents of URL**: `SERVER/api/v1/analytics/today`, *Headers* `Authorization` = `Bearer TOKEN`.
2. **Get Dictionary Value** `habits` → **Repeat with Each**: **Get Dictionary Value** `name` (collect into a list)
   — or simply **Choose from List** on the repeat results.
3. With the chosen habit's `id`: **Get Contents of URL** `SERVER/api/v1/entries`, *Method* PUT, *Headers* as
   above, *Request Body* JSON: `habitId` = the id, `date` = **Format Date** (`yyyy-MM-dd`), `value` (Number) = `1`
   (or the amount, for a measurable habit — add an **Ask for Input** of type Number).

Name the shortcut "Log habit" and say *"Hey Siri, log habit"*.

## 3. One tap from the lock screen, Action button or Back Tap

Make a tiny shortcut per habit you do often, for example **Water +1**: the step-3 request above with the
habit's id. To find an id: open the habit in the web app; the API's `GET /api/v1/habits` lists them too.

- **Lock screen**: long-press the lock screen → Customize → add the **Shortcuts** widget and pick *Water +1*.
- **Action button** (iPhone 15 Pro and later): Settings → Action Button → Shortcut → *Water +1*.
- **Back Tap**: Settings → Accessibility → Touch → Back Tap → Double Tap → *Water +1*.

For measurable habits that count up, use `GET /api/v1/entries?from=DATE&to=DATE&habitId=ID` first and send
the current value plus one.

## The native iPhone app

[`ios/`](../ios/README.md) has a small SwiftUI app with Home Screen and Lock Screen widgets (tap to check a
habit off right on the widget) and an Apple Watch app with complications. It doesn't read Apple Health itself
yet, so keep the automation from recipe 1 for that.
