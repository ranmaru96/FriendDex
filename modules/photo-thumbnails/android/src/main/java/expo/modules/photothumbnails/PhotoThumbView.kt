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
  private var highQuality = false
  private var loadedAssetId = ""
  private var loadedSize = 0
  private var hasImage = false
  private var pendingSize = 0
  private var generation = 0

  init {
    setBackgroundColor(0xFFD6D6D6.toInt())
    addView(imageView)
  }

  fun setAssetId(next: String) {
    assetId = next
  }

  fun setPixelSize(next: Double) {
    pixelSize = next.toInt().coerceAtLeast(1)
  }

  fun setHighQuality(next: Boolean) {
    highQuality = next
  }

  /** props がそろってから1回だけ判断する。 */
  fun applyProps() {
    if (assetId != loadedAssetId) {
      loadedAssetId = assetId
      loadedSize = 0
      hasImage = false
      imageView.setImageDrawable(null)
      request(pixelSize)
      return
    }
    if (!hasImage) {
      if (pendingSize != pixelSize) {
        request(pixelSize)
      }
      return
    }
    // 小さくする方向は今の画像のまま。大きくするときは届くまで今の画像を出しておく。
    if (pixelSize > loadedSize && pendingSize != pixelSize) {
      request(pixelSize)
    }
  }

  private fun request(size: Int) {
    val ticket = ++generation
    pendingSize = size
    val requestedId = loadedAssetId
    if (requestedId.isEmpty()) {
      pendingSize = 0
      return
    }
    PhotoThumbCache.loadAsync(context, requestedId, size) { bitmap ->
      post {
        if (ticket != generation || requestedId != loadedAssetId) {
          return@post
        }
        pendingSize = 0
        if (bitmap == null) {
          return@post
        }
        imageView.setImageBitmap(bitmap)
        hasImage = true
        loadedSize = size
      }
    }
  }
}
