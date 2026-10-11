package expo.modules.photothumbnails

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.provider.MediaStore
import android.util.LruCache
import android.util.Size
import java.util.concurrent.Executors

object PhotoThumbCache {
  /** 低解像度と高解像度の両方を持つため、端末のメモリに合わせて広げる。 */
  private val MAX_BYTES = (Runtime.getRuntime().maxMemory() / 8)
    .coerceIn(24L * 1024 * 1024, 64L * 1024 * 1024)
    .toInt()

  private val cache = object : LruCache<String, Bitmap>(MAX_BYTES) {
    override fun sizeOf(key: String, value: Bitmap): Int = value.byteCount
  }

  private val loadExecutor = Executors.newFixedThreadPool(3)
  private val prefetchExecutor = Executors.newSingleThreadExecutor()

  @Volatile
  private var prepareGeneration = 0

  private fun key(assetId: String, pixelSize: Int) = "$assetId@$pixelSize"

  fun get(assetId: String, pixelSize: Int): Bitmap? = cache.get(key(assetId, pixelSize.coerceAtLeast(1)))

  fun prepare(context: Context, assetIds: List<String>, pixelSize: Int) {
    val appContext = context.applicationContext
    val size = pixelSize.coerceAtLeast(1)
    val ids = assetIds.take(120)
    val generation = ++prepareGeneration
    prefetchExecutor.execute {
      for (assetId in ids) {
        if (generation != prepareGeneration) {
          return@execute
        }
        if (cache.get(key(assetId, size)) != null) {
          continue
        }
        try {
          load(appContext, assetId, size, allowFullDecode = false)
        } catch (_: Exception) {
        }
      }
    }
  }

  fun loadAsync(context: Context, assetId: String, pixelSize: Int, onLoaded: (Bitmap?) -> Unit) {
    val size = pixelSize.coerceAtLeast(1)
    val cached = cache.get(key(assetId, size))
    if (cached != null) {
      onLoaded(cached)
      return
    }
    val appContext = context.applicationContext
    loadExecutor.execute {
      val bitmap = try {
        load(appContext, assetId, size, allowFullDecode = true)
      } catch (_: Exception) {
        null
      }
      onLoaded(bitmap)
    }
  }

  private fun load(context: Context, assetId: String, pixelSize: Int, allowFullDecode: Boolean): Bitmap? {
    val cacheKey = key(assetId, pixelSize)
    cache.get(cacheKey)?.let { return it }
    val id = assetId.toLongOrNull() ?: return null
    val resolver = context.contentResolver
    val uri = ContentUris.withAppendedId(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
    val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      try {
        resolver.loadThumbnail(uri, Size(pixelSize, pixelSize), null)
      } catch (_: Exception) {
        if (allowFullDecode) decodeSampled(resolver, uri, pixelSize) else null
      }
    } else if (allowFullDecode) {
      decodeSampled(resolver, uri, pixelSize)
    } else {
      null
    }
    if (bitmap != null) {
      cache.put(cacheKey, bitmap)
    }
    return bitmap
  }

  private fun decodeSampled(resolver: ContentResolver, uri: android.net.Uri, pixelSize: Int): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    resolver.openInputStream(uri)?.use { stream ->
      BitmapFactory.decodeStream(stream, null, bounds)
    }
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
      return null
    }
    var sample = 1
    while (bounds.outWidth / sample > pixelSize * 2 && bounds.outHeight / sample > pixelSize * 2) {
      sample *= 2
    }
    val options = BitmapFactory.Options().apply { inSampleSize = sample }
    return resolver.openInputStream(uri)?.use { stream ->
      BitmapFactory.decodeStream(stream, null, options)
    }
  }
}
