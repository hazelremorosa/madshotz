The APK builds and is signed: release/mad-shots-1.0.0.apk (8.7 MB). I haven't tested it on a tablet, so the camera, printing and kiosk behaviour are still unconfirmed on real hardware.

That file is signed with a throwaway test key I made only to check the build. Don't install it on the booth tablet, because a later update signed with your real key can't install over it. Create your key and build your own copy:

npm run android:keystore # once; back up ~/.madshots/mad-shots-release.jks and its password
npm run android:release # → release/mad-shots-1.0.0.apk, signed with your key
npm run android:install # installs on the connected tablet

For development testing, use npm run android:dev as described in my previous message. It's free to run now that the release build has finished.

There was no Tauri or Rust code in this repo, on any branch: it was the React/Vite web app. So I added Tauri 2 to it rather than converting an existing Tauri project. The web version is unchanged and still builds as before.

How the hardware works in the app: Android's built-in browser engine, which the app runs in, doesn't support USB devices, Bluetooth devices, downloads, printing, fullscreen or keep-awake, all of which the booth used in Chrome. I wrote native Android code for each one. The printing code you already had (printer.ts) is unchanged, so pairing, the diagnostics and the channel sweep work as before.

┌─────────────────┬─────────────────────────────────────────────────────────────────────────────────┐
│ Feature │ In the app │
├─────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ Camera │ Works as before; Android asks for permission once │
├─────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ USB printer │ Native USB. If you tick "Always open Mad Shots" when you plug the printer in, │
│ (OTG) │ it reconnects on its own after a reboot │
├─────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ Bluetooth │ Native Bluetooth, with a list of nearby printers to pick from. You can now │
│ printer │ raise the BLE chunk size safely, which speeds up prints │
├─────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ System print / │ Android's print dialog, with the label size preselected / a handoff to the │
│ RawBT │ RawBT app │
├─────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ Auto-save │ Gallery, in Pictures/Mad Shots │
│ photos │ │
├─────────────────┼─────────────────────────────────────────────────────────────────────────────────┤
│ Kiosk mode │ Hides the status and navigation bars; keeps the screen on │
└─────────────────┴─────────────────────────────────────────────────────────────────────────────────┘

Other setup:

- Android build files: the Android project lives in src-tauri/gen/android/. It has the permissions, portrait lock, signing, the brand icon and the native code. Don't re-run tauri android init, because it would overwrite those edits.
- Scripts: npm run android:setup, android:keystore, android:release, android:install and android:dev.
- Cloud builds: .github/workflows/android-release.yml can build the signed APK on GitHub; the secrets it needs are listed at the top of the file.
- Guide: docs/android.md covers setup, signing, installing, setting up the tablet and an on-tablet test checklist.

Two things to know:

- Settings don't carry over from the web version. The app keeps its own storage, so you'll need to set up events, templates and Admin settings again inside it.
- Bluetooth printing on the RW403B is still unproven, same as in the web version. Run the test checklist in docs/android.md on the tablet before an event.

Nothing is committed yet. Tell me if you want it committed on new-features.

---

Yes, it runs, but it's the wrong tool for this. npm run tauri dev opens a desktop window of the app (on Linux via WSL), not the Android app. In that window you'd lose more than you'd gain:

- No printing. The native USB and Bluetooth code only exists in the Android build, and the Linux desktop engine has no WebUSB or Web Bluetooth either.
- Probably no camera. WSL usually can't reach your PC's webcam.
- Fullscreen and keep-awake fall back to the web versions, which this engine mostly doesn't support.

So it shows the UI and very little else. Which command to use depends on what you're changing:

You're changing: Screens, styles, flow, anything in React
Use: npm run dev, then open http://lo
Why: Instant hot reload. Same UI as the app, and Chrome has a real camera and WebUSB/Web Bluetooth, so
even printing works.
────────────────────────────────────────
You're changing: Anything that behaveera permission, printing through the
native code, kiosk mode, gallery save) or the Kotlin files
Use: npm run android:dev with the tab
Why: Runs the actual app on the tablet. React edits still hot-reload, and Kotlin/Rust edits rebuild and
reinstall automatically.

A typical loop is to build features ien check them on the tablet with npmrun android:dev before running npm run android:release.

The app runs exactly the same React code as the browser, so anything you change in src/ shows up in both. The app-only behaviour is confie Kotlin files.
