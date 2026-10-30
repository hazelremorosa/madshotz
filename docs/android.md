# Mad Shots on Android (APK)

The booth ships two ways from one codebase:

| Build           | How                              | Runs in                    |
| --------------- | -------------------------------- | -------------------------- |
| **PWA**         | `npm run build` → Vercel         | Chrome on any device       |
| **Android app** | `npm run android:release` → APK  | Tauri 2 + Android WebView  |

The React UI is identical in both. The difference is underneath: the Android
System WebView inside an app has no downloads, `window.print()`, Fullscreen or
Wake Lock, and no web page can reach a Wi-Fi or Bluetooth Classic printer at
all. The app provides these natively:

| Booth feature              | PWA (Chrome)          | Android app                                                              |
| -------------------------- | --------------------- | ------------------------------------------------------------------------ |
| Camera / auto-capture      | `getUserMedia`        | `getUserMedia`, camera permission prompted on first use                  |
| Wi-Fi photo printer        | Print dialog          | **IPP, silent** — auto-discovered or by IP; ink/paper status; job tracking |
| Thermal printer            | —                     | ESC/POS, TSPL, ZPL over USB (OTG), Bluetooth Classic, BLE, or TCP 9100    |
| Any other printer          | Print dialog          | Android print dialog, paper size preset                                  |
| Auto-save each photo       | Chrome Downloads      | Gallery, **Pictures/Mad Shots**                                          |
| Kiosk fullscreen           | Fullscreen API        | Immersive mode: status and nav bars hidden, re-hide after a swipe         |
| Keep screen awake          | Wake Lock API         | `FLAG_KEEP_SCREEN_ON`                                                    |
| Sounds                     | Web Audio             | Web Audio, autoplay allowed                                              |
| QR delivery / upload queue | Cloudflare Worker     | Same Worker; its CORS is `*`, so the app's origin is fine                 |

The native code lives in `src-tauri/gen/android/app/src/main/java/com/madshots/booth/`:

- `BoothPlugin.kt`: command entry points, kiosk window, gallery save, permissions
- `printing/Ipp.kt`: IPP/1.1 client, spoken over a raw socket so LAN printers on
  plain `http://…:631` work without loosening Android's cleartext policy
- `printing/DocumentFormats.kt`: sends JPEG when the printer accepts it, else PDF, else PWG raster
- `printing/Discovery.kt`: mDNS (`_ipp`, `_ipps`, `_pdl-datastream`), USB, paired Bluetooth, BLE scan
- `printing/Transports.kt`: USB bulk, Bluetooth SPP, BLE GATT and TCP 9100 byte pipes
- `printing/PrintEngine.kt`: capabilities, status and ink, job submission, job tracking
- `ImagePrintAdapter.kt`: the Android print-dialog route

The JS side is `src/lib/print/`: `engine.ts` (the store and pipeline),
`layout.ts` (one page layout for every printer), `escpos.ts`, plus the existing
`tspl.ts`, `zpl.ts` and `dither.ts`.

---

## 1. One-time setup (Linux / WSL)

Prerequisites: **JDK 17+**, **Rust** (rustup), **Node 18+**, `curl`, `unzip`.

```bash
npm run android:setup
```

This installs, under `~/Android/Sdk` (set `ANDROID_HOME` first to use a different location):

- Android command-line tools and `platform-tools` (adb)
- SDK platform `android-37.0`, build-tools `36.1.0`
- NDK `28.2.13676358` (pinned; change it in `scripts/android/env.sh`)
- Rust targets `aarch64`, `armv7`, `i686` and `x86_64` for `linux-android`

Then add to `~/.bashrc`:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
export NDK_HOME="$ANDROID_HOME/ndk/28.2.13676358"
export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(which java)")")")"
```

> **Windows without WSL:** install Android Studio (SDK Manager → SDK Platform 37,
> Build-Tools 36.1, NDK 28.2, Command-line Tools), set `ANDROID_HOME`, `NDK_HOME`
> and `JAVA_HOME` (Android Studio's `jbr` folder works), run
> `rustup target add aarch64-linux-android armv7-linux-androideabi`, and use the
> `npx tauri android build` command from step 3 directly.

## 2. Create the signing key (once)

```bash
npm run android:keystore
```

This creates `~/.madshots/mad-shots-release.jks` (PKCS12, RSA 4096, valid for about
27 years) and writes the git-ignored `src-tauri/gen/android/keystore.properties`,
which Gradle reads.

> ⚠️ **Back up the `.jks` file and its password.** Android installs an update only
> when it's signed with the same key as the installed app. If you lose the key, every
> tablet has to uninstall Mad Shots before it can take a new version, and uninstalling
> deletes its settings, events and templates.

CI and other machines can use environment variables instead of the properties file:
`MADSHOTS_KEYSTORE_PATH`, `MADSHOTS_KEYSTORE_PASSWORD`, `MADSHOTS_KEY_ALIAS`, and
optionally `MADSHOTS_KEY_PASSWORD`.

## 3. Build the release APK

```bash
npm run android:release
```

The script:

1. runs `npm run build` (typecheck + Vite; the PWA service worker is left out of
   the app build),
2. cross-compiles the Rust library for **arm64-v8a** and **armeabi-v7a**, which
   covers every real tablet,
3. runs Gradle `assembleRelease` with R8 minification, then signs the APK,
4. checks the signature with `apksigner`,
5. copies the result to **`release/mad-shots-<version>.apk`** with a `.sha256` file next to it.

Run `npm run android:release -- --all` to add the x86 and x86_64 ABIs for emulators.

The equivalent command without the script is
`npx tauri android build --apk --target aarch64 armv7`. The APK lands in
`src-tauri/gen/android/app/build/outputs/apk/universal/release/`.

**Version bumps:** change `version` in `src-tauri/tauri.conf.json`. Tauri derives
Android's `versionCode` from it, and every update must have a higher one.

**Delivery URL:** `VITE_DELIVERY_BASE` from `.env` is compiled in at build time,
the same way it is for the PWA.

**CI:** `.github/workflows/android-release.yml` builds the same APK on GitHub
Actions, either when you trigger it by hand or when you push a `v*` tag. The
required secrets are listed at the top of that file.

## 4. Install on the tablet

### Over USB (adb)

1. On the tablet, go to **Settings → About tablet** and tap **Build number** 7 times.
2. Go to **Settings → System → Developer options** and turn on **USB debugging**.
3. Connect the tablet and accept the "Allow USB debugging?" prompt.
4. Run:

```bash
npm run android:install      # adb install -r release/mad-shots-<version>.apk
```

`-r` upgrades in place and keeps the app's data. Under WSL, a USB device is
visible only to Windows: the script falls back to `adb.exe` if it's on your Windows
PATH. You can also attach the device to WSL with
[usbipd-win](https://learn.microsoft.com/windows/wsl/connect-usb).

### Without a cable

Copy the APK to the tablet (Google Drive, a USB stick, a chat app), open it in
**Files**, and allow **Install unknown apps** for that app when Android asks.

> The installed PWA and the app are separate: different origins, separate storage.
> Events, templates and Admin settings don't carry over, so set the booth up again
> inside the app.

## 5. First-run commissioning on the tablet

1. **Open Mad Shots.** On the first camera screen Android asks for **Camera**:
   tap *While using the app*.
2. **Admin → System → Kiosk lockdown:** turn on *Kiosk mode* (immersive fullscreen) and *Keep
   the screen awake*.
3. **Admin → System → Printer:** the app searches as soon as you open it, and
   lists every printer it can reach, grouped by Wi-Fi, USB, Bluetooth and
   Bluetooth LE. Tap one, then use **Test print**.
   - **Wi-Fi (recommended for the Epson):** the printer and the tablet must be on
     the same network. If it doesn't show up, type its IP into **Add by IP
     address**; the IP is on the printer's network status sheet. Mad Shots reads
     the paper sizes, trays, media types and borderless support from the printer
     itself. Pick **4 × 6" (4R)**, choose the photo paper type and **Best**
     quality. Prints are silent, and Admin shows the ink levels.
   - **No venue Wi-Fi:** turn on the printer's **Wi-Fi Direct**, connect the
     tablet to its `DIRECT-…` network in Android Wi-Fi settings, then add
     `192.168.223.1` (Epson's Wi-Fi Direct address). The tablet has no internet on
     that network, so QR uploads queue and send once it's back online.
   - **USB thermal (OTG):** tap the printer. Android asks "Allow Mad Shots to access
     …": tick **Always open Mad Shots when this device is connected** so the
     grant survives reboots. The command language is read from the printer when it
     reports one. A USB *inkjet* can't be driven directly, so connect it to Wi-Fi.
   - **Bluetooth thermal:** pair the printer in **Android Settings → Bluetooth**
     first (PIN usually `0000` or `1234`), then pick it under Bluetooth. Allow
     **Nearby devices** when asked (Android 8–11 ask for Location instead). BLE-only
     printers show up under Bluetooth LE without pairing.
   - **Thermal settings:** choose ESC/POS (receipt), TSPL or ZPL (labels). If the
     test print comes out as garbage, try the next language. Darkness, contrast and
     halftone style are under the language picker. **What will print** shows the
     exact dithered result.
   - **Print dialog:** the fallback for anything else that has an Android print plugin.
4. **Turn on "Print each guest's photo"** once the test print looks right.
5. **Auto-save:** the first save on Android 8–9 asks for storage access. On Android
   10+ no permission is needed, and photos appear in the gallery under
   **Pictures/Mad Shots**.

### Locking the tablet to the booth

Immersive mode hides the system bars, but a determined guest can still swipe home.
For a fully locked kiosk, use Android's **App pinning**: Settings → Security →
App pinning → On. Then open Mad Shots, go to Overview, tap the app icon and choose
**Pin**. Only the host can unpin, by holding Back + Overview and entering the PIN.

## 6. Test checklist (on the device)

Run through this once per release on the real tablet:

- [ ] App launches into the booth in portrait, with no white flash and no browser UI.
- [ ] Camera permission prompt appears once; the live preview is mirrored per Admin.
- [ ] Full guest flow: Welcome → Layout → auto Capture → Review/Retake → Frames →
      Filter → Editor → Preview → Printing → QR → auto-reset.
- [ ] Admin → Capture → Camera lists the front/back cameras; switching re-opens the stream.
- [ ] Sounds play on the countdown and shutter without a tap first.
- [ ] Kiosk mode hides both system bars; a swipe peeks them and they re-hide.
- [ ] Screen stays on past the system timeout with *Keep awake* on.
- [ ] Auto-save writes to Gallery → Pictures/Mad Shots and shows "Saved to this device ✓".
- [ ] QR upload succeeds online, queues offline, and drains when the network returns.
- [ ] Admin → Ops → Home page artwork upload opens the file picker and accepts an image or GIF.
- [ ] Wi-Fi printer: found by the search (and by IP), test print is silent, a
      guest print reaches "Printed ♥" on the QR screen.
- [ ] Take the paper out mid-job: the guest line says "Waiting: Out of paper", and
      the job finishes on its own once paper is back in.
- [ ] Admin shows ink levels for the Wi-Fi printer.
- [ ] Thermal over USB or Bluetooth (if used): test print, photo print, then
      power-cycle the printer and print again.
- [ ] Update path: build a higher version, run `npm run android:install`, and check
      that settings and events survived.

### Debugging on the device

- **Web side:** with the tablet on USB debugging, open `chrome://inspect` in desktop
  Chrome. Debug builds (`npm run android:dev`, which hot-reloads from Vite) are
  inspectable; release builds aren't.
- **Native side:** run `adb logcat | grep -iE "Tauri|madshots|BoothPlugin|BluetoothGatt|UsbManager|NsdManager"`.

## Project layout

```
src-tauri/
  tauri.conf.json            identifier com.madshots.booth, version, https scheme
  build.rs                   ACL for the native `booth` plugin's commands
  src/lib.rs                 registers BoothPlugin on Android (no Rust logic)
  capabilities/default.json  grants core + booth to the main window
  gen/android/               the Android Studio project (committed, hand-edited)
    keystore.properties      your signing config (git-ignored)
    app/build.gradle.kts     signing, R8
    app/src/main/AndroidManifest.xml   permissions, USB attach filter, portrait
    app/src/main/java/com/madshots/booth/*.kt
src/lib/native/              JS side of the bridge
scripts/android/             setup, keystore, release build, install
```

`src-tauri/gen/android` is generated once by `tauri android init` and then edited
by hand. **Don't re-run `tauri android init`**: it would overwrite the manifest,
theme and signing changes.
