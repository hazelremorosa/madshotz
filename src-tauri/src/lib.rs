use tauri::plugin::{Builder, TauriPlugin};
use tauri::Runtime;

/// Native hardware bridge for the booth.
///
/// The Android System WebView ships without WebUSB, Web Bluetooth, downloads,
/// `window.print()` or the Fullscreen/Wake Lock APIs a kiosk leans on — all of
/// which Chrome gave the PWA for free. `BoothPlugin.kt` supplies them over IPC
/// and `src/lib/native/` re-exposes them under their web names, so the printer
/// stack and screens run unchanged. There is no Rust logic in the path: every
/// command falls through to Kotlin.
fn booth<R: Runtime>() -> TauriPlugin<R> {
  Builder::new("booth")
    .setup(|_app, _api| {
      #[cfg(target_os = "android")]
      _api.register_android_plugin("com.madshots.booth", "BoothPlugin")?;
      Ok(())
    })
    .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(booth())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
