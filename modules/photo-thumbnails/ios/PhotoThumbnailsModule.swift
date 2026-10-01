import ExpoModulesCore

public final class PhotoThumbnailsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PhotoThumbnails")

    Function("prepare") { (ids: [String], pixelSize: Double) in
      let size = CGFloat(pixelSize)
      DispatchQueue.main.async {
        PhotoThumbCache.shared.prepare(ids: ids, pixelSize: size)
      }
    }

    View(PhotoThumbView.self) {
      Prop("assetId") { (view, assetId: String) in
        view.setAssetId(assetId)
      }
      Prop("pixelSize") { (view, pixelSize: Double) in
        view.setPixelSize(pixelSize)
      }
    }
  }
}
