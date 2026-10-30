package com.madshots.booth.printing

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.pdf.PdfDocument
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream

/**
 * Turns the page JPEG the booth renders into whatever an IPP printer accepts.
 *
 * Nearly every modern printer takes `image/jpeg` directly, and that's always
 * tried first: it's what the page already is, so nothing is re-encoded. PDF and
 * PWG raster are the fallbacks — PDF for AirPrint-era printers that only list
 * it, PWG raster for the bare IPP Everywhere minimum.
 */
object DocumentFormats {
  const val JPEG = "image/jpeg"
  const val PDF = "application/pdf"
  const val PWG = "image/pwg-raster"

  /** Best format this printer advertises, in order of preference. */
  fun choose(supported: List<String>): String? = listOf(JPEG, PDF, PWG).firstOrNull { it in supported }

  /** One page, exactly `widthMm` × `heightMm`, the photo filling it. */
  fun pdf(jpeg: ByteArray, widthMm: Double, heightMm: Double, copies: Int = 1): ByteArray {
    val bitmap = decode(jpeg)
    val doc = PdfDocument()
    try {
      val w = (widthMm / 25.4 * 72).toInt()
      val h = (heightMm / 25.4 * 72).toInt()
      repeat(copies.coerceAtLeast(1)) { i ->
        val page = doc.startPage(PdfDocument.PageInfo.Builder(w, h, i + 1).create())
        page.canvas.drawBitmap(bitmap, null, RectF(0f, 0f, w.toFloat(), h.toFloat()), Paint(Paint.FILTER_BITMAP_FLAG))
        doc.finishPage(page)
      }
      return ByteArrayOutputStream().also { doc.writeTo(it) }.toByteArray()
    } finally {
      doc.close()
      bitmap.recycle()
    }
  }

  /**
   * PWG Raster (PWG 5102.4): a 1796-byte page header, then each line run-length
   * compressed. 8-bit sRGB, or sGray when the printer only lists that.
   */
  fun pwgRaster(
    jpeg: ByteArray,
    widthMm: Double,
    heightMm: Double,
    dpi: Int,
    color: Boolean,
    mediaKeyword: String,
    quality: Int,
  ): ByteArray {
    val src = decode(jpeg)
    val width = (widthMm / 25.4 * dpi).toInt()
    val height = (heightMm / 25.4 * dpi).toInt()
    val page = Bitmap.createScaledBitmap(src, width, height, true)
    if (page !== src) src.recycle()

    val channels = if (color) 3 else 1
    val out = ByteArrayOutputStream(width * height)
    val data = DataOutputStream(out)
    data.write("RaS2".toByteArray(Charsets.US_ASCII))
    data.write(header(width, height, dpi, channels, widthMm, heightMm, mediaKeyword, quality))

    val row = IntArray(width)
    val next = IntArray(width)
    val line = ByteArray(width * channels)
    var y = 0
    while (y < height) {
      page.getPixels(row, 0, width, 0, y, width, 1)
      toBytes(row, line, channels)
      // Identical following lines are folded into the repeat count.
      var repeat = 0
      while (y + repeat + 1 < height && repeat < 255) {
        page.getPixels(next, 0, width, 0, y + repeat + 1, width, 1)
        if (!next.contentEquals(row)) break
        repeat++
      }
      data.writeByte(repeat)
      packLine(data, line, channels)
      y += repeat + 1
    }
    page.recycle()
    return out.toByteArray()
  }

  private fun toBytes(row: IntArray, line: ByteArray, channels: Int) {
    for (x in row.indices) {
      val p = row[x]
      val r = (p shr 16) and 0xFF
      val g = (p shr 8) and 0xFF
      val b = p and 0xFF
      if (channels == 3) {
        line[x * 3] = r.toByte(); line[x * 3 + 1] = g.toByte(); line[x * 3 + 2] = b.toByte()
      } else {
        line[x] = ((r * 299 + g * 587 + b * 114) / 1000).toByte()
      }
    }
  }

  /**
   * PackBits-style runs over whole pixels: 0–127 = repeat the next pixel n+1
   * times; 129–255 = 257−n literal pixels follow.
   */
  private fun packLine(out: DataOutputStream, line: ByteArray, bpp: Int) {
    val count = line.size / bpp
    fun same(a: Int, b: Int): Boolean {
      for (k in 0 until bpp) if (line[a * bpp + k] != line[b * bpp + k]) return false
      return true
    }
    var i = 0
    while (i < count) {
      var run = 1
      while (i + run < count && run < 128 && same(i, i + run)) run++
      if (run > 1) {
        out.writeByte(run - 1)
        out.write(line, i * bpp, bpp)
        i += run
        continue
      }
      // Literal stretch: until the next pair of identical pixels.
      var lit = 1
      while (i + lit < count && lit < 128 && !(i + lit + 1 < count && same(i + lit, i + lit + 1))) lit++
      out.writeByte(257 - lit)
      out.write(line, i * bpp, lit * bpp)
      i += lit
    }
  }

  private fun header(
    width: Int,
    height: Int,
    dpi: Int,
    channels: Int,
    widthMm: Double,
    heightMm: Double,
    mediaKeyword: String,
    quality: Int,
  ): ByteArray {
    val h = java.nio.ByteBuffer.allocate(1796)
    fun str(offset: Int, s: String) {
      val b = s.toByteArray(Charsets.US_ASCII)
      for (k in 0 until minOf(63, b.size)) h.put(offset + k, b[k])
    }
    fun u32(offset: Int, v: Int) = h.putInt(offset, v)

    str(0, "PwgRaster")
    u32(276, dpi); u32(280, dpi)               // HWResolution
    u32(340, 1)                                // NumCopies
    u32(352, (widthMm / 25.4 * 72).toInt())    // PageSize in points
    u32(356, (heightMm / 25.4 * 72).toInt())
    u32(372, width); u32(376, height)
    u32(384, 8)                                // BitsPerColor
    u32(388, 8 * channels)                     // BitsPerPixel
    u32(392, width * channels)                 // BytesPerLine
    u32(396, 0)                                // ColorOrder: chunky
    u32(400, if (channels == 3) 19 else 18)    // ColorSpace: sRGB / sGray
    u32(420, channels)                         // NumColors
    u32(452, 1)                                // TotalPageCount
    u32(456, 1); u32(460, 1)                   // Cross-feed / feed transform
    u32(472, width); u32(476, height)          // ImageBox right/bottom
    u32(484, quality)                          // PrintQuality (3/4/5)
    str(1732, mediaKeyword)                    // PageSizeName
    return h.array()
  }

  private fun decode(jpeg: ByteArray): Bitmap =
    BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)
      ?: throw IllegalArgumentException("The page image couldn't be decoded")
}
