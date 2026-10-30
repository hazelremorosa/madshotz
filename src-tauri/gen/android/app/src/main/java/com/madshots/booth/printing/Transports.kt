package com.madshots.booth.printing

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothSocket
import android.bluetooth.BluetoothStatusCodes
import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import java.io.IOException
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.util.UUID
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

/**
 * Byte pipes to printers that take a command language (ESC/POS, TSPL, ZPL)
 * rather than a document. The page is encoded in JS; these only deliver it.
 */
interface RawLink {
  /** Sends a whole job, reporting 0…1 as it goes. Throws on failure. */
  fun send(bytes: ByteArray, progress: (Double) -> Unit)
  fun close()
}

// ── Network: raw TCP, port 9100 ("JetDirect") ──────────────────────────────

class SocketLink(private val host: String, private val port: Int) : RawLink {
  override fun send(bytes: ByteArray, progress: (Double) -> Unit) {
    Socket().use { s ->
      s.connect(InetSocketAddress(host, port), 5_000)
      s.soTimeout = 30_000
      writeChunked(s.getOutputStream(), bytes, 16 * 1024, progress)
    }
  }

  override fun close() {}
}

private fun writeChunked(out: OutputStream, bytes: ByteArray, chunk: Int, progress: (Double) -> Unit) {
  var off = 0
  while (off < bytes.size) {
    val n = minOf(chunk, bytes.size - off)
    out.write(bytes, off, n)
    out.flush()
    off += n
    progress(off.toDouble() / bytes.size)
  }
}

// ── USB (OTG) ─────────────────────────────────────────────────────────────────

/**
 * Bulk OUT to a USB printer. Prefers a printer-class interface (class 7); a
 * vendor-class bulk OUT is the fallback, because cheap thermal heads often
 * don't declare themselves honestly.
 */
class UsbLink(private val manager: UsbManager, val device: UsbDevice) : RawLink {
  private var conn: UsbDeviceConnection? = null
  private var iface: UsbInterface? = null
  private var out: UsbEndpoint? = null

  private fun ensureOpen() {
    if (conn != null) return
    if (!manager.hasPermission(device)) throw IOException("No permission for the USB printer — choose it again in Admin.")
    val c = manager.openDevice(device) ?: throw IOException("Android refused to open the USB printer. Replug the OTG cable.")
    val (i, ep) = pickBulkOut(device) ?: run {
      c.close()
      throw IOException("That USB device has no data endpoint, so it isn't a printer.")
    }
    if (!c.claimInterface(i, true)) {
      c.close()
      throw IOException("The USB printer is held by another driver.")
    }
    conn = c; iface = i; out = ep
  }

  override fun send(bytes: ByteArray, progress: (Double) -> Unit) {
    ensureOpen()
    val c = conn!!
    val ep = out!!
    try {
      var off = 0
      while (off < bytes.size) {
        val n = minOf(16 * 1024, bytes.size - off)
        val sent = c.bulkTransfer(ep, bytes, off, n, 15_000)
        if (sent < 0) throw IOException("The USB printer stopped accepting data (out of paper, or cover open?)")
        off += sent
        progress(off.toDouble() / bytes.size)
      }
      // A transfer that ends exactly on a packet boundary needs a zero-length
      // packet, or some firmware waits for more data forever.
      if (bytes.size % ep.maxPacketSize == 0) c.bulkTransfer(ep, ByteArray(0), 0, 2_000)
    } catch (e: IOException) {
      close()
      throw e
    }
  }

  /** IEEE-1284 device ID — the printer's own statement of which languages it speaks. */
  fun deviceId(): String? {
    ensureOpen()
    val buf = ByteArray(1024)
    val n = conn!!.controlTransfer(
      UsbConstants.USB_DIR_IN or UsbConstants.USB_TYPE_CLASS or 0x01,
      0, 0, (iface!!.id shl 8) or iface!!.alternateSetting, buf, buf.size, 3_000,
    )
    if (n <= 2) return null
    return String(buf, 2, n - 2, Charsets.ISO_8859_1).trim()
  }

  override fun close() {
    runCatching { iface?.let { conn?.releaseInterface(it) } }
    runCatching { conn?.close() }
    conn = null; iface = null; out = null
  }

  companion object {
    fun pickBulkOut(device: UsbDevice): Pair<UsbInterface, UsbEndpoint>? {
      val ifaces = (0 until device.interfaceCount).map { device.getInterface(it) }
        .sortedByDescending { it.interfaceClass == UsbConstants.USB_CLASS_PRINTER }
      for (i in ifaces) for (e in 0 until i.endpointCount) {
        val ep = i.getEndpoint(e)
        if (ep.type == UsbConstants.USB_ENDPOINT_XFER_BULK && ep.direction == UsbConstants.USB_DIR_OUT) return i to ep
      }
      return null
    }

    fun isPrinterLike(device: UsbDevice): Boolean = pickBulkOut(device) != null
  }
}

// ── Bluetooth Classic (SPP) ──────────────────────────────────────────────────

/**
 * RFCOMM serial — how nearly every Bluetooth receipt and label printer is
 * meant to be driven, and the one Bluetooth a web page could never reach. The
 * printer must be paired in Android's Bluetooth settings first.
 */
@SuppressLint("MissingPermission")
class SppLink(private val adapter: BluetoothAdapter, private val address: String) : RawLink {
  private var socket: BluetoothSocket? = null

  private fun connect(): BluetoothSocket {
    socket?.let { if (it.isConnected) return it }
    close()
    val device = adapter.getRemoteDevice(address)
    // Discovery hogs the radio and makes RFCOMM connects fail.
    runCatching { adapter.cancelDiscovery() }
    val attempts = listOf<() -> BluetoothSocket>(
      { device.createRfcommSocketToServiceRecord(SPP) },
      { device.createInsecureRfcommSocketToServiceRecord(SPP) },
      // Some printers publish no SDP record; channel 1 is near-universal.
      {
        device.javaClass.getMethod("createRfcommSocket", Int::class.javaPrimitiveType)
          .invoke(device, 1) as BluetoothSocket
      },
    )
    var last: Exception? = null
    for (make in attempts) {
      try {
        val s = make()
        s.connect()
        socket = s
        return s
      } catch (e: Exception) {
        last = e
      }
    }
    throw IOException("Couldn't connect to the Bluetooth printer — is it on, paired, and not connected to another phone? (${last?.message})")
  }

  override fun send(bytes: ByteArray, progress: (Double) -> Unit) {
    try {
      writeChunked(connect().outputStream, bytes, 2048, progress)
    } catch (e: IOException) {
      // A stale socket (printer power-cycled) fails on first write: reconnect once.
      close()
      writeChunked(connect().outputStream, bytes, 2048, progress)
    }
  }

  override fun close() {
    runCatching { socket?.close() }
    socket = null
  }

  companion object {
    val SPP: UUID = UUID.fromString("00001101-0000-1000-8000-00805f9b34fb")
  }
}

// ── Bluetooth LE ─────────────────────────────────────────────────────────────

/**
 * GATT writes to a BLE-only printer. Picks the writable characteristic from a
 * list of known printer channels, else the first writable one it finds.
 */
@SuppressLint("MissingPermission")
class BleLink(private val context: Context, private val adapter: BluetoothAdapter, private val address: String) :
  BluetoothGattCallback(), RawLink {
  @Volatile private var gatt: BluetoothGatt? = null
  @Volatile private var char: BluetoothGattCharacteristic? = null
  @Volatile private var mtu = 23
  @Volatile private var pending: CompletableFuture<Int>? = null

  private fun connect() {
    if (gatt != null && char != null) return
    close()
    val connected = CompletableFuture<Int>()
    pending = connected
    val g = adapter.getRemoteDevice(address).connectGatt(context, false, this, BluetoothDevice.TRANSPORT_LE)
      ?: throw IOException("Android refused to start a Bluetooth LE connection")
    gatt = g
    if (await(connected, 15) != BluetoothGatt.GATT_SUCCESS) throw IOException("Bluetooth LE connection failed")
    pending = CompletableFuture<Int>().also { if (g.requestMtu(517)) runCatching { await(it, 5) } }
    val discovered = CompletableFuture<Int>()
    pending = discovered
    g.discoverServices()
    await(discovered, 15)
    char = pickChannel(g) ?: throw IOException("That Bluetooth LE device has no writable channel — not a printer?")
  }

  private fun pickChannel(g: BluetoothGatt): BluetoothGattCharacteristic? {
    val writable = g.services.flatMap { s -> s.characteristics.map { s.uuid to it } }.filter { (_, c) ->
      c.properties and (BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0
    }
    fun short(u: UUID) = u.toString().substring(4, 8)
    return writable.minByOrNull { (s, c) ->
      val idx = PREFERRED.indexOfFirst { it.first == short(s) }
      when {
        idx >= 0 && PREFERRED[idx].second == short(c.uuid) -> idx
        idx >= 0 -> 50 + idx
        else -> 100
      }
    }?.second
  }

  override fun send(bytes: ByteArray, progress: (Double) -> Unit) {
    connect()
    val g = gatt!!
    val c = char!!
    // With-response when offered: slower, but a peripheral can't silently drop it.
    val type =
      if (c.properties and BluetoothGattCharacteristic.PROPERTY_WRITE != 0) BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
      else BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
    val max = maxOf(20, mtu - 3)
    var off = 0
    try {
      while (off < bytes.size) {
        val chunk = bytes.copyOfRange(off, minOf(bytes.size, off + max))
        val done = CompletableFuture<Int>()
        pending = done
        var started = false
        for (tries in 0 until 50) {
          started = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            g.writeCharacteristic(c, chunk, type) == BluetoothStatusCodes.SUCCESS
          } else {
            legacyWrite(g, c, chunk, type)
          }
          if (started) break
          Thread.sleep(10)
        }
        if (!started || await(done, 10) != BluetoothGatt.GATT_SUCCESS) throw IOException("The Bluetooth printer rejected the data")
        off += chunk.size
        progress(off.toDouble() / bytes.size)
      }
    } catch (e: IOException) {
      close()
      throw e
    }
  }

  /** Pre-Android 13: the value rides on the characteristic object. */
  @Suppress("DEPRECATION")
  private fun legacyWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, chunk: ByteArray, type: Int): Boolean {
    c.writeType = type
    c.value = chunk
    return g.writeCharacteristic(c)
  }

  private fun await(f: CompletableFuture<Int>, seconds: Long): Int =
    try {
      f.get(seconds, TimeUnit.SECONDS)
    } catch (e: Exception) {
      throw IOException("The Bluetooth printer stopped responding")
    }

  override fun onConnectionStateChange(g: BluetoothGatt, status: Int, newState: Int) {
    if (newState == BluetoothProfile.STATE_CONNECTED) pending?.complete(status)
    else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
      pending?.completeExceptionally(IOException("disconnected"))
      if (gatt === g) {
        gatt = null; char = null
        runCatching { g.close() }
      }
    }
  }

  override fun onMtuChanged(g: BluetoothGatt, mtu: Int, status: Int) {
    if (status == BluetoothGatt.GATT_SUCCESS) this.mtu = mtu
    pending?.complete(status)
  }

  override fun onServicesDiscovered(g: BluetoothGatt, status: Int) {
    pending?.complete(status)
  }

  override fun onCharacteristicWrite(g: BluetoothGatt, c: BluetoothGattCharacteristic, status: Int) {
    pending?.complete(status)
  }

  override fun close() {
    val g = gatt
    gatt = null; char = null
    if (g != null) {
      runCatching { g.disconnect() }
      runCatching { g.close() }
    }
  }

  companion object {
    /** Known printer service/characteristic pairs (16-bit short forms), best first. */
    private val PREFERRED = listOf(
      "ae30" to "ae01", "18f0" to "2af1", "ff00" to "ff02", "ffe0" to "ffe1", "fee7" to "fec7",
    )
  }
}
