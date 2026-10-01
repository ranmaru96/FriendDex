package expo.modules.photothumbnails

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class PhotoThumbnailsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PhotoThumbnails")

    Function("prepare") { assetIds: List<String>, pixelSize: Double ->
      appContext.reactContext?.let { context ->
        PhotoThumbCache.prepare(context, assetIds, pixelSize.toInt())
      }
    }

    View(PhotoThumbView::class) {
      Prop("assetId") { view: PhotoThumbView, assetId: String ->
        view.setAssetId(assetId)
      }
      Prop("pixelSize") { view: PhotoThumbView, pixelSize: Double ->
        view.setPixelSize(pixelSize)
      }
    }
  }
}
