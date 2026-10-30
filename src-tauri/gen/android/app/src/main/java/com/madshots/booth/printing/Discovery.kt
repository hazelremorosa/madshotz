package com.madshots.booth.printing

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothClass
import android.bluetooth.BluetoothDevice
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.hardware.usb.UsbManager
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import app.tauri.plugin.JSObject
import java.net.Inet4Address
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Finds every printer the tablet can reach, all transports at once.
 *
 * - **Wi-Fi**: mDNS/DNS-SD for `_ipp._tcp` / `_ipps._tcp` (AirPrint, Mopria, IPP
 *   Everywhere — every modern network printer) and `_pdl-datastream._tcp` (raw
 *   port 9100, typical of network thermal printers).
 * - **USB**: attached devices with a bulk OUT endpoint.
 * - **Bluetooth Classic**: printers already paired in Android settings.
 * - **Bluetooth LE**: a short scan, filtered to things that look like printers —
 *   a venue full of phones and earbuds would otherwise bury the one that matters.
 *
 * Blocking: call from a worker thread. Returns after `seconds`.
 */
@SuppressLint("MissingPermission")
class Discovery(
  private val context: Context,
  private val usb: UsbManager,
  private val bluetooth: BluetoothAdapter?,
) {
  private val found = ConcurrentHashMap<String, JSObject>()

  fun run(seconds: Int, withBluetooth: Boolean): List<JSObject> {
    found.clear()
    findUsb()
    if (withBluetooth) findBonded()
    val stopNsd = startNsd()
    val stopBle = if (withBluetooth) startBleScan() else ({})
    Thread.sleep(seconds.coerceIn(2, 20) * 1000L)
    stopNsd()
    stopBle()
    // A printer advertising both raw and IPP is listed once, as IPP.
    val ippHosts = found.values.filter { it.getString("connection") == "ipp" }.map { it.getString("host") }.toSet()
    return found.values
      .filterNot { it.getString("connection") == "socket" && it.getString("host") in ippHosts }
      .sortedWith(compareBy({ ORDER.indexOf(it.getString("connection")) }, { it.getString("name") }))
  }

  // ── USB ───────────────────────────────────────────────────────────────────

  private fun findUsb() {
    for (d in usb.deviceList.values) {
      if (!UsbLink.isPrinterLike(d)) continue
      val name = listOfNotNull(d.manufacturerName, d.productName).joinToString(" ").ifBlank { "USB printer" }
      found["usb:${d.vendorId}:${d.productId}"] = JSObject()
        .put("id", "usb:${d.vendorId}:${d.productId}")
        .put("name", name)
        .put("connection", "usb")
        .put("usbVendorId", d.vendorId)
        .put("usbProductId", d.productId)
        .put("detail", "USB · %04x:%04x".format(d.vendorId, d.productId))
    }
  }

  // ── Bluetooth Classic (paired) ───────────────────────────────────────────

  private fun findBonded() {
    val bt = bluetooth ?: return
    if (!bt.isEnabled) return
    for (d in bt.bondedDevices.orEmpty()) {
      if (d.type == BluetoothDevice.DEVICE_TYPE_LE) continue
      if (!mightBePrinter(d.bluetoothClass?.majorDeviceClass)) continue
      found["bt:${d.address}"] = JSObject()
        .put("id", "bt:${d.address}")
        .put("name", d.name ?: d.address)
        .put("connection", "bluetooth")
        .put("address", d.address)
        .put("detail", "Bluetooth (paired) · ${d.address}")
    }
  }

  /** Paired headphones, phones and laptops are certainly not printers. */
  private fun mightBePrinter(major: Int?): Boolean = when (major) {
    BluetoothClass.Device.Major.AUDIO_VIDEO,
    BluetoothClass.Device.Major.PHONE,
    BluetoothClass.Device.Major.COMPUTER,
    BluetoothClass.Device.Major.WEARABLE,
    BluetoothClass.Device.Major.HEALTH,
    BluetoothClass.Device.Major.TOY -> false
    else -> true
  }

  // ── Bluetooth LE ─────────────────────────────────────────────────────────

  private fun startBleScan(): () -> Unit {
    val scanner = bluetooth?.takeIf { it.isEnabled }?.bluetoothLeScanner ?: return {}
    val cb = object : ScanCallback() {
      override fun onScanResult(callbackType: Int, result: ScanResult) {
        val d = result.device
        val name = result.scanRecord?.deviceName ?: d.name ?: return
        val services = result.scanRecord?.serviceUuids.orEmpty().map { it.uuid.toString().substring(4, 8) }
        val printerish = PRINTER_NAME.containsMatchIn(name) || services.any { it in PRINTER_SERVICES }
        if (!printerish || found.containsKey("bt:${d.address}")) return
        found["ble:${d.address}"] = JSObject()
          .put("id", "ble:${d.address}")
          .put("name", name)
          .put("connection", "ble")
          .put("address", d.address)
          .put("detail", "Bluetooth LE · ${d.address}")
      }
    }
    runCatching {
      scanner.startScan(null, ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(), cb)
    }
    return { runCatching { scanner.stopScan(cb) } }
  }

  // ── Wi-Fi (mDNS) ─────────────────────────────────────────────────────────

  private fun startNsd(): () -> Unit {
    val nsd = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    // Pre-Android 14, NsdManager resolves one service at a time and fails any
    // overlapping request — so resolves are queued on one thread.
    val resolver = Executors.newSingleThreadExecutor()
    val listeners = ArrayList<NsdManager.DiscoveryListener>()

    for (type in SERVICE_TYPES) {
      val listener = object : NsdManager.DiscoveryListener {
        override fun onServiceFound(info: NsdServiceInfo) {
          resolver.execute { resolve(nsd, info, type) }
        }
        override fun onDiscoveryStarted(serviceType: String) {}
        override fun onDiscoveryStopped(serviceType: String) {}
        override fun onServiceLost(info: NsdServiceInfo) {}
        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
      }
      runCatching {
        nsd.discoverServices(type, NsdManager.PROTOCOL_DNS_SD, listener)
        listeners.add(listener)
      }
    }
    return {
      listeners.forEach { runCatching { nsd.stopServiceDiscovery(it) } }
      resolver.shutdown()
      resolver.awaitTermination(3, TimeUnit.SECONDS)
    }
  }

  private fun resolve(nsd: NsdManager, info: NsdServiceInfo, type: String) {
    val done = CountDownLatch(1)
    @Suppress("DEPRECATION")
    nsd.resolveService(info, object : NsdManager.ResolveListener {
      override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
        done.countDown()
      }

      override fun onServiceResolved(r: NsdServiceInfo) {
        try {
          record(r, type)
        } finally {
          done.countDown()
        }
      }
    })
    done.await(5, TimeUnit.SECONDS)
  }

  private fun record(r: NsdServiceInfo, type: String) {
    val address = if (Build.VERSION.SDK_INT >= 34) {
      r.hostAddresses.firstOrNull { it is Inet4Address } ?: r.hostAddresses.firstOrNull()
    } else {
      @Suppress("DEPRECATION") r.host
    } ?: return
    val host = address.hostAddress ?: return
    val txt = r.attributes.mapValues { (_, v) -> v?.let { String(it, Charsets.UTF_8) } ?: "" }
    val name = txt["ty"]?.takeIf { it.isNotBlank() } ?: r.serviceName

    if (type.startsWith("_pdl")) {
      found.putIfAbsent(
        "socket:$host:${r.port}",
        JSObject()
          .put("id", "socket:$host:${r.port}")
          .put("name", name)
          .put("connection", "socket")
          .put("host", host)
          .put("port", r.port)
          .put("detail", "Wi-Fi (raw) · $host"),
      )
      return
    }

    val tls = type.startsWith("_ipps")
    val key = "ipp:$host"
    // Prefer the plain-IPP record when a printer advertises both.
    if (tls && found.containsKey(key)) return
    found[key] = JSObject()
      .put("id", key)
      .put("name", name)
      .put("connection", "ipp")
      .put("host", host)
      .put("port", r.port)
      .put("path", txt["rp"]?.takeIf { it.isNotBlank() } ?: "ipp/print")
      .put("tls", tls)
      .put("detail", "Wi-Fi · $host")
  }

  companion object {
    private val SERVICE_TYPES = listOf("_ipp._tcp.", "_ipps._tcp.", "_pdl-datastream._tcp.")
    private val ORDER = listOf("ipp", "usb", "bluetooth", "socket", "ble")
    private val PRINTER_NAME = Regex(
      "print|pos|label|therm|receipt|munbyn|rw4|mpt|mtp|xp-|zj-|gp-|pt-|ql-|epson|tsc|zebra|-ble$",
      RegexOption.IGNORE_CASE,
    )
    private val PRINTER_SERVICES = setOf("ae30", "18f0", "ff00", "ffe0", "fee7")
  }
}
