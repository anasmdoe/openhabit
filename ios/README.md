# OpenHabit for iPhone and Apple Watch

A small SwiftUI app whose job is to put your habits where you look:

- **Home Screen widget** (small, medium, large): today's habits with a tap-to-complete button each (iOS 17
  interactive widgets), stacked habits marked `↳`, streaks.
- **Lock Screen widgets**: a progress ring, "3 of 7 habits · Next: Gym", or one line above the clock. They also
  show in StandBy.
- **Apple Watch app**: today's list, tap to check in or undo. **Complications** for the watch face: ring, corner
  gauge, summary or one line. The watch gets your server and token from the iPhone (WatchConnectivity).
- The app itself: server address and personal API token, and today's list.

It talks only to your own OpenHabit server with a personal API token (web app → Account → API tokens).
For Apple Health, use the Shortcuts automation in [docs/iphone-shortcuts.md](../docs/iphone-shortcuts.md).

> **Status: builds in CI, not yet run on a device.** The shared core (`Shared/`: models, rules, API client) is
> unit-tested with `swift test`, and `.github/workflows/ios.yml` builds the iPhone app, its widgets, the watch
> app and its complications for the simulator on a macOS runner. Running on a real iPhone needs your Apple
> developer team (free personal teams work for your own devices).

## Build

Needs a Mac with Xcode 16 or newer and [XcodeGen](https://github.com/yonaskolb/XcodeGen):

```
cd ios
brew install xcodegen
xcodegen generate        # writes OpenHabit.xcodeproj from project.yml
open OpenHabit.xcodeproj
```

In Xcode, set your team under *Signing & Capabilities* for the four targets (the App Group
`group.app.openhabit` is already declared; with a personal team Xcode may ask you to rename it, along with the
bundle identifiers, to something unique). Run the **OpenHabit** scheme on your iPhone and the
**OpenHabitWatch** scheme on your watch. `swift test` runs the core tests without Xcode.

| Folder | What |
|---|---|
| `Shared/` | Models, stacking order, tap rules, settings, API client (Foundation only; unit-tested) |
| `App/` | The iPhone app and the iPhone → watch settings sync |
| `Widgets/` | Home Screen and Lock Screen widgets, and the tap-to-complete intent |
| `WidgetShared/` | The timeline provider and lock-screen / complication views used on both devices |
| `Watch/`, `WatchWidgets/` | The watch app and its complications |
