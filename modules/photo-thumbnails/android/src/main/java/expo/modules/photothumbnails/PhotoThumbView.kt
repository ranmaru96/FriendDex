package expo.modules.photothumbnails

import android.content.Context
import android.widget.ImageView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class PhotoThumbView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val imageView = ImageView(context).apply {
    scaleType = ImageView.ScaleType.CENTER_CROP
    layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
  }
  private var assetId = ""
  private var pixelSize = 1
  private var generation = 0

  init {
    setBackgroundColor(0xFFD6D6D6.toInt())
    addView(imageView)
  }

  fun setAssetId(next: String) {
    if (next == assetId) {
      return
    }
    assetId = next
    reload()
  }

  fun setPixelSize(next: Double) {
    val size = next.toInt().coerceAtLeast(1)
    if (size == pixelSize) {
      return
    }
    pixelSize = size
    reload()
  }

  private fun reload() {
    val ticket = ++generation
    imageView.setImageDrawable(null)
    if (assetId.isEmpty()) {
      return
    }
    PhotoThumbCache.loadAsync(context, assetId, pixelSize) { bitmap ->
      post {
        if (ticket != generation) {
          return@post
        }
        imageView.setImageBitmap(bitmap)
      }
    }
  }
}
