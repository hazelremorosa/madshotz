package com.madshots.booth.printing

import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.ByteBuffer
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

/**
 * A small IPP/1.1 client — just enough to print a photo silently to any network
 * printer (Epson, HP, Canon, Brother… anything AirPrint/Mopria/IPP Everywhere).
 *
 * HTTP is spoken over a plain socket rather than HttpURLConnection on purpose:
 * Android's network security policy blocks cleartext HTTP from the URL stack,
 * and printers on a LAN are almost all `http://…:631`. Loosening that policy
 * app-wide would also loosen it for the WebView. A raw socket isn't subject to
 * it, and IPP needs only a single POST.
 */

/** IPP value tags (RFC 8010 §3.5). */
object Tag {
  const val OPERATION = 0x01
  const val JOB = 0x02
  const val END = 0x03
  const val PRINTER = 0x04
  const val UNSUPPORTED_GROUP = 0x05

  const val UNSUPPORTED = 0x10
  const val UNKNOWN = 0x12
  const val NO_VALUE = 0x13

  const val INTEGER = 0x21
  const val BOOLEAN = 0x22
  const val ENUM = 0x23
  const val OCTET_STRING = 0x30
  const val DATE_TIME = 0x31
  const val RESOLUTION = 0x32
  const val RANGE = 0x33
  const val BEG_COLLECTION = 0x34
  const val TEXT_WITH_LANG = 0x35
  const val NAME_WITH_LANG = 0x36
  const val END_COLLECTION = 0x37
  const val TEXT = 0x41
  const val NAME = 0x42
  const val KEYWORD = 0x44
  const val URI = 0x45
  const val CHARSET = 0x47
  const val LANGUAGE = 0x48
  const val MIME = 0x49
  const val MEMBER_NAME = 0x4A
}

object Op {
  const val PRINT_JOB = 0x0002
  const val GET_JOB_ATTRIBUTES = 0x0009
  const val GET_PRINTER_ATTRIBUTES = 0x000B
}

data class Resolution(val x: Int, val y: Int, val unitsDpi: Boolean)

/** One attribute in a request: a tag plus one or more values. */
class IppAttr(val tag: Int, val name: String, val values: List<Any>)

/** A response, flattened by group. Collection values become nested maps. */
class IppResponse(
  val status: Int,
  val operation: Map<String, List<Any>>,
  val printer: Map<String, List<Any>>,
  val job: Map<String, List<Any>>,
  val unsupported: Map<String, List<Any>>,
) {
  val ok get() = status < 0x0100

  fun strings(name: String): List<String> =
    (printer[name] ?: job[name] ?: emptyList()).filterIsInstance<String>()
  fun ints(name: String): List<Int> =
    (printer[name] ?: job[name] ?: emptyList()).filterIsInstance<Int>()
  fun string(name: String): String? = strings(name).firstOrNull()
  fun int(name: String): Int? = ints(name).firstOrNull()
}

class IppException(message: String, val status: Int = -1) : Exception(message)

/** Where a printer lives: `ipp://host:port/path` (or ipps with `tls`). */
data class IppTarget(val host: String, val port: Int, val path: String, val tls: Boolean) {
  val uri get() = "${if (tls) "ipps" else "ipp"}://$host:$port/${path.trimStart('/')}"
}

object Ipp {
  private var requestId = 1

  // ── Encoding ──────────────────────────────────────────────────────────────

  fun encode(op: Int, groups: List<Pair<Int, List<IppAttr>>>, document: ByteArray? = null): ByteArray {
    val bytes = ByteArrayOutputStream()
    val out = DataOutputStream(bytes)
    out.writeShort(0x0101) // IPP/1.1: the version every printer accepts
    out.writeShort(op)
    out.writeInt(requestId++)
    for ((group, attrs) in groups) {
      out.writeByte(group)
      for (a in attrs) writeAttr(out, a.tag, a.name, a.values)
    }
    out.writeByte(Tag.END)
    if (document != null) out.write(document)
    return bytes.toByteArray()
  }

  private fun writeAttr(out: DataOutputStream, tag: Int, name: String, values: List<Any>) {
    values.forEachIndexed { i, v -> writeValue(out, tag, if (i == 0) name else "", v) }
  }

  @Suppress("UNCHECKED_CAST")
  private fun writeValue(out: DataOutputStream, tag: Int, name: String, v: Any) {
    out.writeByte(tag)
    writeString(out, name)
    when (tag) {
      Tag.INTEGER, Tag.ENUM -> {
        out.writeShort(4); out.writeInt(v as Int)
      }
      Tag.BOOLEAN -> {
        out.writeShort(1); out.writeByte(if (v as Boolean) 1 else 0)
      }
      Tag.BEG_COLLECTION -> {
        // A collection is a run of member-name/value pairs closed by an end tag.
        out.writeShort(0)
        for (member in v as List<IppAttr>) {
          out.writeByte(Tag.MEMBER_NAME)
          writeString(out, "")
          writeString(out, member.name)
          member.values.forEach { mv -> writeValue(out, member.tag, "", mv) }
        }
        out.writeByte(Tag.END_COLLECTION)
        writeString(out, "")
        out.writeShort(0)
      }
      else -> writeString(out, v as String)
    }
  }

  private fun writeString(out: DataOutputStream, s: String) {
    val b = s.toByteArray(Charsets.UTF_8)
    out.writeShort(b.size)
    out.write(b)
  }

  /** The operation attributes every request opens with. */
  fun operationAttrs(target: IppTarget, extra: List<IppAttr> = emptyList()) = listOf(
    IppAttr(Tag.CHARSET, "attributes-charset", listOf("utf-8")),
    IppAttr(Tag.LANGUAGE, "attributes-natural-language", listOf("en")),
    IppAttr(Tag.URI, "printer-uri", listOf(target.uri)),
    IppAttr(Tag.NAME, "requesting-user-name", listOf("Mad Shots")),
  ) + extra

  // ── Decoding ──────────────────────────────────────────────────────────────

  fun decode(body: ByteArray): IppResponse {
    val buf = ByteBuffer.wrap(body)
    if (buf.remaining() < 8) throw IppException("The printer sent an empty IPP reply")
    buf.short // version
    val status = buf.short.toInt() and 0xFFFF
    buf.int // request id

    val groups = HashMap<Int, LinkedHashMap<String, MutableList<Any>>>()
    var current: LinkedHashMap<String, MutableList<Any>>? = null
    var lastName = ""
    while (buf.hasRemaining()) {
      val tag = buf.get().toInt() and 0xFF
      if (tag == Tag.END) break
      if (tag < 0x10) {
        current = groups.getOrPut(tag) { LinkedHashMap() }
        continue
      }
      val name = readString(buf)
      if (name.isNotEmpty()) lastName = name
      val value = readValue(buf, tag)
      current?.getOrPut(lastName) { ArrayList() }?.let { if (value != null) it.add(value) }
    }
    return IppResponse(
      status,
      groups[Tag.OPERATION] ?: emptyMap(),
      groups[Tag.PRINTER] ?: emptyMap(),
      groups[Tag.JOB] ?: emptyMap(),
      groups[Tag.UNSUPPORTED_GROUP] ?: emptyMap(),
    )
  }

  private fun readString(buf: ByteBuffer): String {
    val len = buf.short.toInt() and 0xFFFF
    val b = ByteArray(len)
    buf.get(b)
    return String(b, Charsets.UTF_8)
  }

  private fun readValue(buf: ByteBuffer, tag: Int): Any? {
    val len = buf.short.toInt() and 0xFFFF
    return when (tag) {
      Tag.INTEGER, Tag.ENUM -> if (len == 4) buf.int else skip(buf, len)
      Tag.BOOLEAN -> buf.get().toInt() != 0
      Tag.RANGE -> if (len == 8) (buf.int..buf.int) else skip(buf, len)
      Tag.RESOLUTION -> if (len == 9) Resolution(buf.int, buf.int, buf.get().toInt() == 3) else skip(buf, len)
      Tag.BEG_COLLECTION -> {
        skip(buf, len)
        readCollection(buf)
      }
      Tag.TEXT_WITH_LANG, Tag.NAME_WITH_LANG -> {
        // language-length, language, text-length, text
        val end = buf.position() + len
        readString(buf)
        val text = readString(buf)
        buf.position(end)
        text
      }
      Tag.UNSUPPORTED, Tag.UNKNOWN, Tag.NO_VALUE -> skip(buf, len)
      in 0x40..0x5F -> {
        val b = ByteArray(len)
        buf.get(b)
        String(b, Charsets.UTF_8)
      }
      else -> skip(buf, len)
    }
  }

  @Suppress("UNCHECKED_CAST")
  private fun readCollection(buf: ByteBuffer): Map<String, Any?> {
    val map = LinkedHashMap<String, Any?>()
    var member = ""
    while (buf.hasRemaining()) {
      val tag = buf.get().toInt() and 0xFF
      readString(buf) // always empty inside a collection
      if (tag == Tag.END_COLLECTION) {
        skip(buf, buf.short.toInt() and 0xFFFF)
        break
      }
      if (tag == Tag.MEMBER_NAME) {
        member = readString(buf)
        continue
      }
      val v = readValue(buf, tag)
      // Repeated values for one member become a list.
      val prev = map[member]
      map[member] = when (prev) {
        null -> v
        is MutableList<*> -> (prev as MutableList<Any?>).apply { add(v) }
        else -> mutableListOf(prev, v)
      }
    }
    return map
  }

  private fun skip(buf: ByteBuffer, len: Int): Any? {
    buf.position(buf.position() + len)
    return null
  }

  // ── Transport ─────────────────────────────────────────────────────────────

  /**
   * POSTs one IPP request and returns the decoded reply. A printer that insists
   * on TLS answers plain HTTP with 426 Upgrade Required; that's retried as
   * ipps transparently and the caller learns about it from the returned target.
   */
  fun post(target: IppTarget, payload: ByteArray, readTimeoutMs: Int = 30_000): Pair<IppResponse, IppTarget> {
    val (code, body) = http(target, payload, readTimeoutMs)
    if (code == 426 && !target.tls) {
      val secure = target.copy(tls = true)
      return post(secure, payload, readTimeoutMs)
    }
    if (code != 200) throw IppException("The printer answered HTTP $code — is ${target.uri} really an IPP printer?")
    return decode(body) to target
  }

  private fun http(target: IppTarget, payload: ByteArray, readTimeoutMs: Int): Pair<Int, ByteArray> {
    val socket = open(target, readTimeoutMs)
    socket.use { s ->
      val out = s.getOutputStream().buffered(64 * 1024)
      val path = "/" + target.path.trimStart('/')
      val head = "POST $path HTTP/1.1\r\n" +
        "Host: ${target.host}:${target.port}\r\n" +
        "Content-Type: application/ipp\r\n" +
        "Content-Length: ${payload.size}\r\n" +
        "User-Agent: MadShots/1.0 IPP/1.1\r\n" +
        "Connection: close\r\n\r\n"
      out.write(head.toByteArray(Charsets.US_ASCII))
      writeBody(out, payload)
      out.flush()
      return readResponse(s.getInputStream().buffered())
    }
  }

  /** Large photo jobs: write in slices so a progress callback could hook in. */
  private fun writeBody(out: OutputStream, payload: ByteArray) {
    var off = 0
    while (off < payload.size) {
      val n = minOf(64 * 1024, payload.size - off)
      out.write(payload, off, n)
      off += n
    }
  }

  fun open(target: IppTarget, readTimeoutMs: Int): Socket {
    val plain = Socket()
    plain.connect(InetSocketAddress(target.host, target.port), 5_000)
    plain.soTimeout = readTimeoutMs
    if (!target.tls) return plain
    // Printers ship self-signed certificates; on a LAN that's the norm, and the
    // alternative is no TLS at all. Trust the printer the host picked.
    val ssl = SSLContext.getInstance("TLS").apply { init(null, arrayOf<TrustManager>(TrustAll), SecureRandom()) }
    val s = ssl.socketFactory.createSocket(plain, target.host, target.port, true) as SSLSocket
    s.soTimeout = readTimeoutMs
    s.startHandshake()
    return s
  }

  private object TrustAll : X509TrustManager {
    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
    override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
  }

  private fun readLine(input: InputStream): String {
    val sb = StringBuilder()
    while (true) {
      val c = input.read()
      if (c < 0) break
      if (c == '\n'.code) break
      if (c != '\r'.code) sb.append(c.toChar())
    }
    return sb.toString()
  }

  private fun readResponse(input: InputStream): Pair<Int, ByteArray> {
    var status: Int
    var headers: Map<String, String>
    // Skip "100 Continue" interim responses.
    do {
      val statusLine = readLine(input)
      status = statusLine.split(" ").getOrNull(1)?.toIntOrNull()
        ?: throw IppException("No HTTP response from the printer")
      val h = HashMap<String, String>()
      while (true) {
        val line = readLine(input)
        if (line.isEmpty()) break
        val i = line.indexOf(':')
        if (i > 0) h[line.substring(0, i).trim().lowercase()] = line.substring(i + 1).trim()
      }
      headers = h
    } while (status == 100)

    val body = ByteArrayOutputStream()
    val length = headers["content-length"]?.toIntOrNull()
    when {
      headers["transfer-encoding"]?.contains("chunked", true) == true -> {
        while (true) {
          val size = readLine(input).substringBefore(';').trim().toInt(16)
          if (size == 0) break
          body.write(readExactly(input, size))
          readLine(input)
        }
      }
      length != null -> body.write(readExactly(input, length))
      else -> body.write(input.readBytes())
    }
    return status to body.toByteArray()
  }

  private fun readExactly(input: InputStream, n: Int): ByteArray {
    val b = ByteArray(n)
    var off = 0
    while (off < n) {
      val r = input.read(b, off, n - off)
      if (r < 0) throw IppException("The printer closed the connection mid-reply")
      off += r
    }
    return b
  }

  // ── Operations ────────────────────────────────────────────────────────────

  val CAPABILITY_ATTRS = listOf(
    "printer-make-and-model", "printer-name", "printer-info", "printer-state", "printer-state-reasons",
    "printer-state-message", "document-format-supported", "media-supported", "media-default",
    "media-ready", "media-col-supported", "media-type-supported", "media-source-supported",
    "media-bottom-margin-supported", "media-top-margin-supported", "media-left-margin-supported",
    "media-right-margin-supported", "print-color-mode-supported", "color-supported",
    "print-quality-supported", "print-scaling-supported", "copies-supported",
    "pwg-raster-document-resolution-supported", "pwg-raster-document-type-supported",
    "marker-names", "marker-levels", "marker-colors", "marker-types", "printer-uuid",
  )

  fun getPrinterAttributes(target: IppTarget, attrs: List<String> = CAPABILITY_ATTRS): Pair<IppResponse, IppTarget> {
    val req = encode(
      Op.GET_PRINTER_ATTRIBUTES,
      listOf(
        Tag.OPERATION to operationAttrs(
          target,
          listOf(IppAttr(Tag.KEYWORD, "requested-attributes", attrs)),
        )
      ),
    )
    val (res, t) = post(target, req, 10_000)
    if (!res.ok) throw IppException("The printer refused the status request (${statusText(res.status)})", res.status)
    return res to t
  }

  fun printJob(
    target: IppTarget,
    format: String,
    document: ByteArray,
    jobAttrs: List<IppAttr>,
  ): IppResponse {
    val req = encode(
      Op.PRINT_JOB,
      listOf(
        Tag.OPERATION to operationAttrs(
          target,
          listOf(
            IppAttr(Tag.NAME, "job-name", listOf("Mad Shots")),
            IppAttr(Tag.MIME, "document-format", listOf(format)),
          ),
        ),
        Tag.JOB to jobAttrs,
      ),
      document,
    )
    // Generous: some printers only reply once the whole page is rasterised.
    return post(target, req, 180_000).first
  }

  fun getJob(target: IppTarget, jobId: Int): IppResponse {
    val req = encode(
      Op.GET_JOB_ATTRIBUTES,
      listOf(
        Tag.OPERATION to operationAttrs(
          target,
          listOf(
            IppAttr(Tag.INTEGER, "job-id", listOf(jobId)),
            IppAttr(Tag.KEYWORD, "requested-attributes", listOf("job-state", "job-state-reasons", "job-state-message")),
          ),
        )
      ),
    )
    return post(target, req, 10_000).first
  }

  fun statusText(status: Int): String = when (status) {
    0x0400 -> "bad request"
    0x0401 -> "forbidden"
    0x0402, 0x0403 -> "authentication required"
    0x040A -> "document format not supported"
    0x040B -> "attributes not supported"
    0x0500 -> "printer internal error"
    0x0506 -> "printer busy"
    0x0507 -> "printer not accepting jobs"
    0x0504 -> "IPP version not supported"
    else -> "status 0x%04x".format(status)
  }
}
