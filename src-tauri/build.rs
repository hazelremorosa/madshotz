/// Every command the Kotlin `BoothPlugin` answers, in the snake_case the
/// frontend invokes (Tauri camel-cases them on the way to Kotlin). Listing them
/// here is what generates the `booth:default` permission the capability grants —
/// a command missing from this list is rejected by the ACL before it reaches
/// Android.
const BOOTH_COMMANDS: &[&str] = &[
  // Kiosk
  "set_immersive",
  "set_keep_awake",
  // Output
  "save_image",
  "print_image",
  // Printing (src/lib/print)
  "printer_discover",
  "printer_probe",
  "printer_capabilities",
  "printer_status",
  "printer_identify_usb",
  "printer_print",
  "printer_job",
  "printer_forget",
  // Plugin events (`addPluginListener`)
  "register_listener",
  "remove_listener",
];

fn main() {
  tauri_build::try_build(
    tauri_build::Attributes::new().plugin(
      "booth",
      tauri_build::InlinedPlugin::new()
        .commands(BOOTH_COMMANDS)
        .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
    ),
  )
  .expect("failed to run tauri-build");
}
