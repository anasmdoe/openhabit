# Android app (Trusted Web Activity)

Wraps the OpenHabit web app in a thin Android shell with no browser bar, for the Play Store or
for sideloading. It is the same app: updates ship by deploying the web app, not by releasing a new APK.
Read [../docs/mobile-strategy.md](../docs/mobile-strategy.md) first: you only need this for store
presence. The installed PWA already covers reminders and Done / Snooze buttons.

**Not built or tested in this repository's CI**: building needs the Android SDK and your own
signing key. The files here are the inputs.

## Steps

1. Deploy OpenHabit on a public **HTTPS** host (a TWA will not open an insecure or localhost site).
2. Install the tool: `npm i -g @bubblewrap/cli` (it fetches a JDK and the Android SDK on first run).
3. Copy `twa-manifest.json` to a new folder, replace every `REPLACE-WITH-YOUR-HOST`, then:
   ```bash
   bubblewrap init --manifest=https://YOUR-HOST/manifest.webmanifest   # or reuse twa-manifest.json
   bubblewrap build        # asks for the keystore passwords; produces app-release-bundle.aab and a signed .apk
   bubblewrap fingerprint  # prints the SHA-256 of your signing key
   ```
4. Put that fingerprint into `assetlinks.json` (start from `assetlinks.json.example`) and serve it at
   `https://YOUR-HOST/.well-known/assetlinks.json` with `Content-Type: application/json`.
   Without this the app opens with a browser address bar. If you use Play App Signing, add the
   Play Console's "App signing key" fingerprint as well.
5. Install the `.apk` on a phone to test (`adb install app-release-signed.apk`), then upload the
   `.aab` to the Play Console.

## Notes

- Google Play requires a recent target SDK (API 36 for new apps and updates from 31 Aug 2026).
  Check that your Bubblewrap version targets it before publishing.
- Keep `openhabit-release.keystore` and its passwords safe and out of git. Losing it means you cannot
  update the app.
- Web Push works inside a TWA once notifications are allowed for the site.
- Home-screen widgets and Health Connect are not possible with a TWA; that needs a native build.
