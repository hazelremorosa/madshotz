package com.madshots.booth

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Paint
import android.graphics.RectF
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.pdf.PrintedPdfDocument
import java.io.FileOutputStream

/**
 * One composite, fitted to whatever paper the host picks in the print dialog.
 *
 * Mirrors the PWA's print document: the image is *contained* — letterboxed,
 * never cropped or stretched — and centred inside the page less the margin,
 * once per copy.
 */
class ImagePrintAdapter(
  private val context: Context,
  private val bitmap: Bitmap,
  private val marginMm: Double,
  private val copies: Int,
  private val onDone: () -> Unit,
) : PrintDocumentAdapter() {
  private var attributes: PrintAttributes? = null

  override fun onLayout(
    oldAttributes: PrintAttributes?,
    newAttributes: PrintAttributes,
    cancellationSignal: CancellationSignal,
    callback: LayoutResultCallback,
    extras: Bundle?,
  ) {
    if (cancellationSignal.isCanceled) {
      callback.onLayoutCancelled()
      return
    }
    attributes = newAttributes
    val info = PrintDocumentInfo.Builder("mad-shots.pdf")
      .setContentType(PrintDocumentInfo.CONTENT_TYPE_PHOTO)
      .setPageCount(copies)
      .build()
    callback.onLayoutFinished(info, newAttributes != oldAttributes)
  }

  override fun onWrite(
    pages: Array<out PageRange>,
    destination: ParcelFileDescriptor,
    cancellationSignal: CancellationSignal,
    callback: WriteResultCallback,
  ) {
    val pdf = PrintedPdfDocument(context, attributes ?: return callback.onWriteFailed("No layout"))
    try {
      for (i in 0 until copies) {
        if (cancellationSignal.isCanceled) {
          callback.onWriteCancelled()
          return
        }
        val page = pdf.startPage(i)
        // PDF pages are in points (1/72 in).
        val margin = (marginMm / 25.4 * 72).toFloat()
        val box = RectF(
          margin,
          margin,
          page.info.pageWidth - margin,
          page.info.pageHeight - margin,
        )
        val scale = minOf(box.width() / bitmap.width, box.height() / bitmap.height)
        val w = bitmap.width * scale
        val h = bitmap.height * scale
        val left = box.left + (box.width() - w) / 2
        val top = box.top + (box.height() - h) / 2
        page.canvas.drawBitmap(
          bitmap,
          null,
          RectF(left, top, left + w, top + h),
          Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG),
        )
        pdf.finishPage(page)
      }
      FileOutputStream(destination.fileDescriptor).use { pdf.writeTo(it) }
      callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
    } catch (e: Exception) {
      callback.onWriteFailed(e.message)
    } finally {
      pdf.close()
    }
  }

  override fun onFinish() {
    onDone()
  }
}
