package com.madshots.booth

import android.Manifest
import android.app.Activity
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.BitmapFactory
import android.hardware.usb.UsbManager
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.print.PrintAttributes
import android.print.PrintManager
import android.provider.MediaStore
import android.util.Base64
import android.view.WindowManager
import android.webkit.WebView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import com.madshots.booth.printing.PrintEngine
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

/**
 * The booth's hardware bridge.
 *
 * The Android System WebView has none of the browser APIs a kiosk leans on —
 * downloads, `window.print()`, Fullscreen, Wake Lock — and no web page could
 * ever reach a Wi-Fi or Bluetooth Classic printer. This plugin provides all of
 * it; `src/lib/native/` and `src/lib/print/` are the JS side.
 *
 * Printing is delegated to `printing/PrintEngine`: discovery, IPP (silent
 * network printing), and raw delivery over USB, Bluetooth and TCP.
 *
 * Commands arrive on a Tauri IPC thread. Anything that blocks (printer I/O,
 * file writes) moves to a worker; anything touching the window or showing a
 * dialog posts to the UI thread.
 */
@TauriPlugin(
  permissions = [
    // Android 12+: scan and connect are their own runtime permissions.
    Permission(
      strings = [Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT],
      alias = "bluetooth",
    ),
    // Android 8–11: BLE scanning is gated behind location instead.
    Permission(strings = [Manifest.permission.ACCESS_FINE_LOCATION], alias = "bluetoothLegacy"),
    // Android 8–9 only: writing to Pictures before scoped storage existed.
    Permission(strings = [Manifest.permission.WRITE_EXTERNAL_STORAGE], alias = "storage"),
  ],
)
class BoothPlugin(private val activity: Activity) : Plugin(activity) {
  private val io = Executors.newSingleThreadExecutor()
  private val printWorker = Executors.newSingleThreadExecutor()
  private val usbManager = activity.getSystemService(Context.USB_SERVICE) as UsbManager
  private val engine = PrintEngine(
    activity,
    usbManager,
    (activity.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager?)?.adapter,
  )

  @Volatile private var immersive = false

  override fun load(webView: WebView) {
    // Sound effects play from timers, not taps, and the shutter sound has to
    // fire on the countdown — Chrome allows that for an installed PWA, the
    // WebView doesn't unless told to.
    webView.settings.mediaPlaybackRequiresUserGesture = false
  }

  override fun onDestroy(activity: AppCompatActivity) {
    printWorker.execute { engine.close() }
  }

  override fun onResume(activity: AppCompatActivity) {
    // Coming back from the print dialog or a permission prompt restores the
    // system bars; put the booth back the way the host left it.
    if (immersive) applyImmersive(true)
  }

  // ── Kiosk ────────────────────────────────────────────────────────────────

  @Command
  fun setImmersive(invoke: Invoke) {
    immersive = invoke.getArgs().optBoolean("enabled", true)
    activity.runOnUiThread {
      applyImmersive(immersive)
      invoke.resolve()
    }
  }

  private fun applyImmersive(enabled: Boolean) {
    val window = activity.window
    val controller = WindowInsetsControllerCompat(window, window.decorView)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
      // Use the area beside a camera notch too, or a black band shows there.
      window.attributes = window.attributes.apply {
        layoutInDisplayCutoutMode =
          if (enabled) WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
          else WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_DEFAULT
      }
    }
    // Layout isn't touched here: MainActivity pads the content by the bar
    // insets, which drop to zero while the bars are hidden.
    if (enabled) {
      // A guest's edge swipe peeks the bars and they hide again on their own,
      // the native equivalent of the web guard re-entering fullscreen.
      controller.systemBarsBehavior =
        WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
      controller.hide(WindowInsetsCompat.Type.systemBars())
    } else {
      controller.show(WindowInsetsCompat.Type.systemBars())
    }
  }

  @Command
  fun setKeepAwake(invoke: Invoke) {
    val enabled = invoke.getArgs().optBoolean("enabled", true)
    activity.runOnUiThread {
      if (enabled) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      invoke.resolve()
    }
  }

  // ── Saving to the gallery ────────────────────────────────────────────────

  @Command
  fun saveImage(invoke: Invoke) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
      getPermissionState("storage") != PermissionState.GRANTED
    ) {
      requestPermissionForAlias("storage", invoke, "storagePermission")
      return
    }
    io.execute { writeImage(invoke) }
  }

  @PermissionCallback
  private fun storagePermission(invoke: Invoke) {
    if (getPermissionState("storage") == PermissionState.GRANTED) io.execute { writeImage(invoke) }
    else invoke.reject("Storage permission denied — photos can't be saved to this tablet.")
  }

  private fun writeImage(invoke: Invoke) {
    try {
      val args = invoke.getArgs()
      val bytes = Base64.decode(args.getString("data"), Base64.DEFAULT)
      val mime = args.optString("mime", "image/jpeg")
      val name = args.optString("filename", "mad-shots-${System.currentTimeMillis()}.jpg")

      val uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        val resolver = activity.contentResolver
        val values = ContentValues().apply {
          put(MediaStore.Images.Media.DISPLAY_NAME, name)
          put(MediaStore.Images.Media.MIME_TYPE, mime)
          put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/$ALBUM")
          put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
          ?: throw IllegalStateException("The gallery refused a new photo")
        resolver.openOutputStream(uri)?.use { it.write(bytes) }
          ?: throw IllegalStateException("Could not open the new photo for writing")
        values.clear()
        values.put(MediaStore.Images.Media.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        uri.toString()
      } else {
        @Suppress("DEPRECATION")
        val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), ALBUM)
        dir.mkdirs()
        val file = File(dir, name)
        file.writeBytes(bytes)
        MediaScannerConnection.scanFile(activity, arrayOf(file.absolutePath), arrayOf(mime), null)
        Uri.fromFile(file).toString()
      }
      invoke.resolve(JSObject().put("uri", uri))
    } catch (e: Exception) {
      invoke.reject("Could not save the photo: ${e.message}")
    }
  }

  // ── Printing via the OS ──────────────────────────────────────────────────

  @Command
  fun printImage(invoke: Invoke) {
    io.execute {
      val args = invoke.getArgs()
      val bytes = Base64.decode(args.getString("data"), Base64.DEFAULT)
      val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      if (bitmap == null) {
        invoke.reject("The composite couldn't be decoded for printing")
        return@execute
      }
      val widthMm = args.optDouble("widthMm", 101.6)
      val heightMm = args.optDouble("heightMm", 152.4)
      val copies = args.optInt("copies", 1).coerceIn(1, 10)
      val marginMm = args.optDouble("marginMm", 0.0)

      // The label size goes in as a *hint*: a print service that knows the
      // stock preselects it, rather than defaulting to A4 and shrinking the
      // label into a corner. The host can still change it in the dialog.
      val media = PrintAttributes.MediaSize(
        "mad_shots_label",
        "Label ${widthMm.toInt()} × ${heightMm.toInt()} mm",
        mmToMils(widthMm),
        mmToMils(heightMm),
      )
      val attrs = PrintAttributes.Builder()
        .setMediaSize(if (widthMm > heightMm) media.asLandscape() else media.asPortrait())
        .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
        .build()

      activity.runOnUiThread {
        try {
          val manager = activity.getSystemService(Activity.PRINT_SERVICE) as PrintManager
          val adapter = ImagePrintAdapter(activity, bitmap, marginMm, copies) { invoke.resolve() }
          manager.print(args.optString("jobName", "Mad Shots"), adapter, attrs)
        } catch (e: Exception) {
          invoke.reject("Couldn't open the print dialog: ${e.message}")
        }
      }
    }
  }

  // ── Printing ─────────────────────────────────────────────────────────────

  private val bleAlias: String
    get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) "bluetooth" else "bluetoothLegacy"

  private fun bluetoothGranted() = getPermissionState(bleAlias) == PermissionState.GRANTED

  /** Runs printer work in order — two jobs must never interleave on one printer. */
  private fun job(invoke: Invoke, block: (JSObject) -> JSObject?) {
    printWorker.execute {
      try {
        val result = block(invoke.getArgs())
        if (result == null) invoke.resolve() else invoke.resolve(result)
      } catch (e: Exception) {
        invoke.reject(e.message ?: e.toString())
      }
    }
  }

  @Command
  fun printerDiscover(invoke: Invoke) {
    val wantBluetooth = invoke.getArgs().optBoolean("bluetooth", true)
    if (wantBluetooth && !bluetoothGranted()) {
      requestPermissionForAlias(bleAlias, invoke, "discoverPermission")
      return
    }
    discover(invoke, wantBluetooth)
  }

  @PermissionCallback
  private fun discoverPermission(invoke: Invoke) {
    // Denied Bluetooth still leaves Wi-Fi and USB worth searching.
    discover(invoke, bluetoothGranted())
  }

  private fun discover(invoke: Invoke, bluetooth: Boolean) {
    io.execute {
      try {
        val list = engine.discover(invoke.getArgs().optInt("seconds", 6), bluetooth)
        invoke.resolve(JSObject().put("printers", list).put("bluetooth", bluetooth))
      } catch (e: Exception) {
        invoke.reject(e.message ?: e.toString())
      }
    }
  }

  @Command
  fun printerProbe(invoke: Invoke) = job(invoke) { a ->
    JSObject().put(
      "printer",
      engine.probe(
        a.getString("host").trim(),
        a.optInt("port", 0).takeIf { it > 0 },
        a.optString("path").takeIf { it.isNotBlank() },
      ),
    )
  }

  @Command
  fun printerCapabilities(invoke: Invoke) = job(invoke) { a ->
    JSObject().put("caps", engine.capabilitiesOf(a.getJSONObject("printer")))
  }

  @Command
  fun printerStatus(invoke: Invoke) {
    // Off the print queue: a status poll must never wait behind a 30 s job.
    io.execute {
      try {
        invoke.resolve(engine.status(invoke.getArgs().getJSONObject("printer")))
      } catch (e: Exception) {
        invoke.reject(e.message ?: e.toString())
      }
    }
  }

  @Command
  fun printerIdentifyUsb(invoke: Invoke) {
    val printer = invoke.getArgs().getJSONObject("printer")
    withUsbPermission(invoke, printer) { job(invoke) { engine.identifyUsb(printer) } }
  }

  @Command
  fun printerPrint(invoke: Invoke) {
    val args = invoke.getArgs()
    val printer = args.getJSONObject("printer")
    val run = {
      job(invoke) { a ->
        val bytes = Base64.decode(a.getString("data"), Base64.DEFAULT)
        if (printer.getString("connection") == "ipp") {
          engine.printIpp(printer, bytes, a.getJSONObject("job"))
        } else {
          var last = -1.0
          engine.sendRaw(printer, bytes) { f ->
            // ~20 updates per job is plenty for a progress bar.
            if (f - last >= 0.05 || f >= 1.0) {
              last = f
              trigger("printProgress", JSObject().put("fraction", f))
            }
          }
          JSObject()
        }
      }
    }
    when (printer.getString("connection")) {
      "usb" -> withUsbPermission(invoke, printer, run)
      "bluetooth", "ble" ->
        if (bluetoothGranted()) run()
        else invoke.reject("Bluetooth permission isn't granted — choose the printer again in Admin.")
      else -> run()
    }
  }

  @Command
  fun printerJob(invoke: Invoke) = job(invoke) { a ->
    engine.jobState(a.getJSONObject("printer"), a.getInt("jobId"))
  }

  @Command
  fun printerForget(invoke: Invoke) = job(invoke) { a ->
    engine.forget(a.getString("id"))
    null
  }

  /**
   * Raises Android's "Allow Mad Shots to access…" prompt if needed. Ticking
   * "Always open Mad Shots when this device is connected" there (offered for
   * the devices in `usb_device_filter.xml`) makes the grant survive reboots.
   */
  private fun withUsbPermission(invoke: Invoke, printer: JSONObject, then: () -> Unit) {
    val device = usbManager.deviceList.values.firstOrNull {
      it.vendorId == printer.optInt("usbVendorId") && it.productId == printer.optInt("usbProductId")
    }
    if (device == null) {
      invoke.reject("The USB printer isn't plugged in.")
      return
    }
    if (usbManager.hasPermission(device)) {
      then()
      return
    }
    val action = "${activity.packageName}.USB_PERMISSION"
    val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != action) return
        runCatching { activity.unregisterReceiver(this) }
        if (usbManager.hasPermission(device)) then()
        else invoke.reject("USB access was declined — tap the printer again and choose Allow.")
      }
    }
    ContextCompat.registerReceiver(activity, receiver, IntentFilter(action), ContextCompat.RECEIVER_NOT_EXPORTED)
    // UsbManager adds extras, so the intent must be mutable — and on Android 14
    // a mutable PendingIntent must be explicit, hence the package.
    val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    val pending = PendingIntent.getBroadcast(activity, 0, Intent(action).setPackage(activity.packageName), flags)
    usbManager.requestPermission(device, pending)
  }

  companion object {
    /** Gallery album the auto-save writes into (`Pictures/Mad Shots`). */
    const val ALBUM = "Mad Shots"

    fun mmToMils(mm: Double): Int = Math.round(mm / 25.4 * 1000).toInt()
  }
}
