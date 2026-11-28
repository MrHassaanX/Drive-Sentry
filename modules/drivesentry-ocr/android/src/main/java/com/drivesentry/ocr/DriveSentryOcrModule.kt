package com.drivesentry.ocr

import android.net.Uri
import android.graphics.BitmapFactory
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DriveSentryOcrModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DriveSentryOcr")
    AsyncFunction("recognize") { value: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject("OCR_UNAVAILABLE", "The recognition engine is unavailable.", null)
        return@AsyncFunction
      }
      val uri = Uri.parse(value)
      if (uri.scheme != "file" && uri.scheme != "content") {
        promise.reject("OCR_IMAGE", "Choose an image from this device.", null)
        return@AsyncFunction
      }
      val image = try {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        require(bounds.outWidth > 0 && bounds.outHeight > 0 &&
          bounds.outWidth.toLong() * bounds.outHeight <= 32_000_000)
        InputImage.fromFilePath(context, uri)
      } catch (_: Exception) {
        promise.reject("OCR_IMAGE", "The image could not be opened or exceeds 32 megapixels.", null)
        return@AsyncFunction
      }
      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image).addOnCompleteListener { task ->
        try {
          if (task.isSuccessful) promise.resolve(task.result.text)
          else promise.reject("OCR_FAILED", "Text recognition failed on this image. Try a clearer photo.", null)
        } finally {
          recognizer.close()
        }
      }
    }
  }
}
