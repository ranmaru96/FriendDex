import ExpoModulesCore

public final class PhotoThumbnailsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PhotoThumbnails")

    Function("prepare") { (ids: [String], pixelSize: Double, high: Bool) in
      let size = CGFloat(pixelSize)
      DispatchQueue.main.async {
        PhotoThumbCache.shared.prepare(ids: ids, pixelSize: size, high: high)
      }
    }

    View(PhotoThumbView.self) {
      Prop("assetId") { (view, assetId: String) in
        view.setAssetId(assetId)
      }
      Prop("pixelSize") { (view, pixelSize: Double) in
        view.setPixelSize(pixelSize)
      }
      Prop("highQuality") { (view, highQuality: Bool) in
        view.setHighQuality(highQuality)
      }
      OnViewDidUpdateProps { (view: PhotoThumbView) in
        view.applyProps()
      }
    }
  }
}
