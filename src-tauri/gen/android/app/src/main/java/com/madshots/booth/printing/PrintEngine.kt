package com.madshots.booth.printing

import android.bluetooth.BluetoothAdapter
import android.content.Context
import android.hardware.usb.UsbManager
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import org.json.JSONObject
import java.io.IOException
import java.net.InetSocketAddress
import java.net.Socket

/**
 * Everything the booth's printer layer asks of Android, transport by transport.
 *
 * A printer arrives from JS as the JSON the booth saved when the host picked it
 * (see `SavedPrinter` in `src/lib/print/types.ts`): a `connection` plus the
 * address fields that connection needs. All calls block; the plugin runs them
 * on a worker thread.
 */
class PrintEngine(
  private val context: Context,
  private val usb: UsbManager,
  private val bluetooth: BluetoothAdapter?,
) {
  /** Open raw links, kept between jobs so Bluetooth doesn't re-pair every guest. */
  private val links = HashMap<String, RawLink>()

  fun discover(seconds: Int, withBluetooth: Boolean): JSArray =
    JSArray().apply { Discovery(context, usb, bluetooth).run(seconds, withBluetooth).forEach { put(it) } }

  // ── IPP: probe and capabilities ──────────────────────────────────────────

  private fun target(p: JSONObject) = IppTarget(
    p.getString("host"),
    p.optInt("port", 631),
    p.optString("path", "ipp/print"),
    p.optBoolean("tls", false),
  )

  /**
   * Turns a typed-in address into a printer. Tries the IPP paths printers
   * actually use, then raw 9100 — so "192.168.223.1" alone is enough for an
   * Epson in Wi-Fi Direct mode.
   */
  fun probe(host: String, port: Int?, path: String?): JSObject {
    val ports = listOfNotNull(port, 631).distinct()
    val paths = listOfNotNull(path, "ipp/print", "ipp/printer", "ipp", "").distinct()
    var lastError: Exception? = null
    for (pt in ports) for (pa in paths) {
      try {
        val (res, t) = Ipp.getPrinterAttributes(IppTarget(host, pt, pa, false))
        val name = res.string("printer-make-and-model") ?: res.string("printer-name") ?: host
        return JSObject()
          .put("id", "ipp:$host")
          .put("name", name)
          .put("connection", "ipp")
          .put("host", host)
          .put("port", t.port)
          .put("path", t.path)
          .put("tls", t.tls)
          .put("detail", "Wi-Fi · $host")
          .put("caps", capabilities(res))
      } catch (e: Exception) {
        lastError = e
        // Connection refused on this port won't improve with another path.
        if (e is java.net.ConnectException) break
      }
    }
    // No IPP: a raw printer on 9100 is the other common network setup.
    val rawPort = port?.takeIf { it != 631 } ?: 9100
    if (reachable(host, rawPort)) {
      return JSObject()
        .put("id", "socket:$host:$rawPort")
        .put("name", "Network printer $host")
        .put("connection", "socket")
        .put("host", host)
        .put("port", rawPort)
        .put("detail", "Wi-Fi (raw) · $host")
    }
    throw IOException(
      "No printer answered at $host (${lastError?.message ?: "no reply"}). Check the IP on the printer's " +
        "network status sheet, and that the tablet is on the same Wi-Fi."
    )
  }

  fun capabilitiesOf(printer: JSONObject): JSObject = capabilities(Ipp.getPrinterAttributes(target(printer)).first)

  private fun capabilities(res: IppResponse): JSObject {
    val media = JSArray()
    for (kw in res.strings("media-supported").distinct()) {
      val size = mediaSize(kw) ?: continue
      media.put(JSObject().put("keyword", kw).put("widthMm", size.first).put("heightMm", size.second))
    }
    // Borderless = the printer accepts zero for every margin.
    val borderless = listOf("bottom", "top", "left", "right").all { 0 in res.ints("media-$it-margin-supported") }
    val copiesMax = (res.printer["copies-supported"]?.firstOrNull() as? IntRange)?.last ?: 1
    val resolutions = (res.printer["pwg-raster-document-resolution-supported"] ?: emptyList())
      .filterIsInstance<Resolution>().filter { it.unitsDpi }.map { it.x }
    val colorModes = res.strings("print-color-mode-supported")
    return JSObject()
      .put("makeModel", res.string("printer-make-and-model") ?: "")
      .put("formats", JSArray(res.strings("document-format-supported")))
      .put("media", media)
      .put("mediaDefault", res.string("media-default") ?: "")
      .put("mediaReady", JSArray(res.strings("media-ready")))
      .put("mediaTypes", JSArray(res.strings("media-type-supported")))
      .put("mediaSources", JSArray(res.strings("media-source-supported")))
      .put("mediaCol", res.strings("media-col-supported").isNotEmpty())
      .put("color", colorModes.contains("color") || res.printer["color-supported"]?.firstOrNull() == true)
      .put("colorModes", JSArray(colorModes))
      .put("qualities", JSArray(res.ints("print-quality-supported")))
      .put("scaling", JSArray(res.strings("print-scaling-supported")))
      .put("copiesMax", copiesMax)
      .put("borderless", borderless)
      .put("pwgResolutions", JSArray(resolutions))
      .put("pwgTypes", JSArray(res.strings("pwg-raster-document-type-supported")))
  }

  /** `na_index-4x6_4x6in` → 101.6 × 152.4 mm. PWG names describe their own size. */
  private fun mediaSize(keyword: String): Pair<Double, Double>? {
    if (keyword.startsWith("custom_") || keyword.contains("roll")) return null
    val m = Regex("_(\\d+(?:\\.\\d+)?)x(\\d+(?:\\.\\d+)?)(mm|in)$").find(keyword) ?: return null
    val k = if (m.groupValues[3] == "in") 25.4 else 1.0
    val w = m.groupValues[1].toDouble() * k
    val h = m.groupValues[2].toDouble() * k
    return Math.round(w * 10) / 10.0 to Math.round(h * 10) / 10.0
  }

  // ── Status ────────────────────────────────────────────────────────────────

  fun status(printer: JSONObject): JSObject {
    val out = JSObject()
    when (printer.getString("connection")) {
      "ipp" -> {
        val res = try {
          Ipp.getPrinterAttributes(
            target(printer),
            listOf(
              "printer-state", "printer-state-reasons", "printer-state-message",
              "marker-names", "marker-levels", "marker-colors", "media-ready",
            ),
          ).first
        } catch (e: Exception) {
          return out.put("state", "offline").put("message", e.message ?: "unreachable")
        }
        out.put("state", when (res.int("printer-state")) { 3 -> "idle"; 4 -> "processing"; 5 -> "stopped"; else -> "unknown" })
        out.put("reasons", JSArray(res.strings("printer-state-reasons").filter { it != "none" }))
        out.put("message", res.string("printer-state-message") ?: "")
        out.put("mediaReady", JSArray(res.strings("media-ready")))
        val names = res.strings("marker-names")
        val levels = res.ints("marker-levels")
        val colors = res.strings("marker-colors")
        val markers = JSArray()
        names.forEachIndexed { i, n ->
          markers.put(JSObject().put("name", n).put("level", levels.getOrElse(i) { -1 }).put("color", colors.getOrElse(i) { "" }))
        }
        out.put("markers", markers)
      }
      "socket" -> out.put(
        "state",
        if (reachable(printer.getString("host"), printer.optInt("port", 9100))) "idle" else "offline",
      )
      "usb" -> out.put("state", if (findUsb(printer) != null) "idle" else "offline")
      "bluetooth", "ble" -> out.put("state", if (bluetooth?.isEnabled == true) "idle" else "offline")
        .put("message", if (bluetooth?.isEnabled == true) "" else "Bluetooth is off")
      else -> out.put("state", "idle")
    }
    return out
  }

  private fun reachable(host: String, port: Int): Boolean =
    runCatching { Socket().use { it.connect(InetSocketAddress(host, port), 2_500) } }.isSuccess

  // ── IPP printing ─────────────────────────────────────────────────────────

  /**
   * Submits one page. `job` carries the host's choices (see `IppJobOptions` in
   * JS); each is only sent when this printer says it supports it, because an
   * unsupported attribute makes plenty of printers reject the whole job.
   */
  fun printIpp(printer: JSONObject, jpeg: ByteArray, job: JSONObject): JSObject {
    val t = target(printer)
    val res = Ipp.getPrinterAttributes(t).first
    val caps = capabilities(res)
    val formats = res.strings("document-format-supported")
    val widthMm = job.getDouble("widthMm")
    val heightMm = job.getDouble("heightMm")
    val copies = job.optInt("copies", 1).coerceIn(1, 10)
    val nativeCopies = copies > 1 && caps.getInt("copiesMax") >= copies

    val format = DocumentFormats.choose(formats)
      ?: throw IOException("This printer accepts none of JPEG, PDF or PWG raster (it lists: ${formats.joinToString()}).")
    val document = when (format) {
      DocumentFormats.JPEG -> jpeg
      DocumentFormats.PDF -> DocumentFormats.pdf(jpeg, widthMm, heightMm)
      else -> {
        val dpis = caps.getJSONArray("pwgResolutions").let { a -> (0 until a.length()).map { a.getInt(it) } }
        val dpi = dpis.filter { it <= 300 }.maxOrNull() ?: dpis.minOrNull() ?: 300
        val color = job.optBoolean("color", true) &&
          res.strings("pwg-raster-document-type-supported").any { it.startsWith("srgb") }
        DocumentFormats.pwgRaster(jpeg, widthMm, heightMm, dpi, color, job.optString("mediaKeyword"), qualityEnum(job))
      }
    }

    val full = jobAttributes(res, job, if (nativeCopies) copies else 1)
    val jobs = if (nativeCopies) 1 else copies
    var lastId = -1
    repeat(jobs) {
      var reply = Ipp.printJob(t, format, document, full)
      // Rejected over an attribute: retry with the bare minimum rather than fail
      // the guest's print over a tray or quality setting.
      if (reply.status == 0x040B || reply.status == 0x0400) {
        reply = Ipp.printJob(t, format, document, minimalAttributes(res, job))
      }
      if (!reply.ok) throw IOException("The printer refused the job: ${Ipp.statusText(reply.status)}")
      lastId = reply.int("job-id") ?: -1
    }
    return JSObject().put("jobId", lastId).put("format", format)
  }

  private fun qualityEnum(job: JSONObject) = when (job.optString("quality")) {
    "draft" -> 3
    "high" -> 5
    else -> 4
  }

  private fun jobAttributes(res: IppResponse, job: JSONObject, copies: Int): List<IppAttr> {
    val attrs = ArrayList<IppAttr>()
    if (copies > 1) attrs += IppAttr(Tag.INTEGER, "copies", listOf(copies))

    val keyword = job.optString("mediaKeyword")
    val borderless = job.optBoolean("borderless") &&
      listOf("bottom", "top", "left", "right").all { 0 in res.ints("media-$it-margin-supported") }
    if (res.strings("media-col-supported").isNotEmpty()) {
      val members = ArrayList<IppAttr>()
      members += IppAttr(
        Tag.BEG_COLLECTION,
        "media-size",
        listOf(
          listOf(
            IppAttr(Tag.INTEGER, "x-dimension", listOf(Math.round(job.getDouble("widthMm") * 100).toInt())),
            IppAttr(Tag.INTEGER, "y-dimension", listOf(Math.round(job.getDouble("heightMm") * 100).toInt())),
          )
        ),
      )
      if (borderless) for (side in listOf("bottom", "top", "left", "right")) {
        members += IppAttr(Tag.INTEGER, "media-$side-margin", listOf(0))
      }
      job.optString("mediaSource").takeIf { it.isNotBlank() && it in res.strings("media-source-supported") }
        ?.let { members += IppAttr(Tag.KEYWORD, "media-source", listOf(it)) }
      job.optString("mediaType").takeIf { it.isNotBlank() && it in res.strings("media-type-supported") }
        ?.let { members += IppAttr(Tag.KEYWORD, "media-type", listOf(it)) }
      attrs += IppAttr(Tag.BEG_COLLECTION, "media-col", listOf(members))
    } else if (keyword.isNotBlank() && keyword in res.strings("media-supported")) {
      attrs += IppAttr(Tag.KEYWORD, "media", listOf(keyword))
    }

    val mode = if (job.optBoolean("color", true)) "color" else "monochrome"
    if (mode in res.strings("print-color-mode-supported")) attrs += IppAttr(Tag.KEYWORD, "print-color-mode", listOf(mode))

    val q = qualityEnum(job)
    if (q in res.ints("print-quality-supported")) attrs += IppAttr(Tag.ENUM, "print-quality", listOf(q))

    // The page is rendered at exactly the media size, so "fill" on borderless
    // paper and "fit" otherwise give the expected result either way.
    val scaling = if (borderless || job.optBoolean("fill")) "fill" else "fit"
    if (scaling in res.strings("print-scaling-supported")) attrs += IppAttr(Tag.KEYWORD, "print-scaling", listOf(scaling))
    return attrs
  }

  private fun minimalAttributes(res: IppResponse, job: JSONObject): List<IppAttr> {
    val keyword = job.optString("mediaKeyword")
    return if (keyword.isNotBlank() && keyword in res.strings("media-supported")) {
      listOf(IppAttr(Tag.KEYWORD, "media", listOf(keyword)))
    } else emptyList()
  }

  fun jobState(printer: JSONObject, jobId: Int): JSObject {
    val res = Ipp.getJob(target(printer), jobId)
    val state = when (res.int("job-state")) {
      3 -> "pending"; 4 -> "held"; 5 -> "processing"; 6 -> "stopped"
      7 -> "canceled"; 8 -> "aborted"; 9 -> "completed"; else -> "unknown"
    }
    return JSObject()
      .put("state", state)
      .put("reasons", JSArray(res.strings("job-state-reasons").filter { it != "none" }))
      .put("message", res.string("job-state-message") ?: "")
  }

  // ── Raw printing ─────────────────────────────────────────────────────────

  private fun findUsb(printer: JSONObject) = usb.deviceList.values.firstOrNull {
    it.vendorId == printer.optInt("usbVendorId") && it.productId == printer.optInt("usbProductId")
  }

  private fun link(printer: JSONObject): RawLink {
    val id = printer.getString("id")
    // A USB printer that was replugged is a new device object; rebind.
    links[id]?.let { l ->
      if (l !is UsbLink || findUsb(printer) == l.device) return l
      l.close()
      links.remove(id)
    }
    val link = when (printer.getString("connection")) {
      "socket" -> SocketLink(printer.getString("host"), printer.optInt("port", 9100))
      "usb" -> UsbLink(usb, findUsb(printer) ?: throw IOException("The USB printer isn't plugged in."))
      "bluetooth" -> SppLink(bt(), printer.getString("address"))
      "ble" -> BleLink(context, bt(), printer.getString("address"))
      else -> throw IOException("Not a raw printer")
    }
    links[id] = link
    return link
  }

  private fun bt(): BluetoothAdapter =
    bluetooth?.takeIf { it.isEnabled } ?: throw IOException("Bluetooth is off. Turn it on in quick settings.")

  fun sendRaw(printer: JSONObject, bytes: ByteArray, progress: (Double) -> Unit) {
    link(printer).send(bytes, progress)
  }

  /** Reads the USB printer's IEEE-1284 ID and guesses its command language. */
  fun identifyUsb(printer: JSONObject): JSObject {
    val device = findUsb(printer) ?: throw IOException("The USB printer isn't plugged in.")
    val link = UsbLink(usb, device)
    val id = try { link.deviceId() ?: "" } finally { link.close() }
    val cmd = Regex("(?:CMD|COMMAND SET):([^;]*)", RegexOption.IGNORE_CASE).find(id)?.groupValues?.get(1)?.uppercase() ?: ""
    val language = when {
      "TSPL" in cmd || "TSC" in cmd -> "tspl"
      "ZPL" in cmd -> "zpl"
      "ESC/POS" in cmd || "ESCPOS" in cmd -> "escpos"
      cmd.isNotBlank() -> "unsupported"
      else -> ""
    }
    return JSObject().put("deviceId", id).put("language", language)
  }

  fun forget(id: String) {
    links.remove(id)?.close()
  }

  fun close() {
    links.values.forEach { runCatching { it.close() } }
    links.clear()
  }
}
