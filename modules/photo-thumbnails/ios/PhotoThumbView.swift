import ExpoModulesCore
import Photos
import UIKit

public final class PhotoThumbView: ExpoView {
  private let imageView = UIImageView()
  private var assetId = ""
  private var pixelSize: CGFloat = 1
  private var requestId: PHImageRequestID?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = UIColor(white: 0.84, alpha: 1)
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.isUserInteractionEnabled = false
    imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(imageView)
  }

  public override func layoutSubviews() {
    super.layoutSubviews()
    imageView.frame = bounds
  }

  func setAssetId(_ next: String) {
    guard next != assetId else {
      return
    }
    assetId = next
    reload()
  }

  func setPixelSize(_ next: Double) {
    let size = CGFloat(max(next, 1))
    guard size != pixelSize else {
      return
    }
    pixelSize = size
    reload()
  }

  private func reload() {
    if let requestId {
      PhotoThumbCache.shared.manager.cancelImageRequest(requestId)
      self.requestId = nil
    }
    imageView.image = nil
    guard !assetId.isEmpty else {
      return
    }
    let assets = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
    guard let asset = assets.firstObject else {
      return
    }
    let requestedId = assetId
    let target = CGSize(width: pixelSize, height: pixelSize)
    requestId = PhotoThumbCache.shared.manager.requestImage(
      for: asset,
      targetSize: target,
      contentMode: .aspectFill,
      options: PhotoThumbCache.shared.options
    ) { [weak self] image, info in
      let cancelled = (info?[PHImageCancelledKey] as? Bool) ?? false
      DispatchQueue.main.async {
        guard let self, self.assetId == requestedId, !cancelled else {
          return
        }
        if let image {
          self.imageView.image = image
          return
        }
        self.requestFullerThumbnail(asset: asset, target: target, requestedId: requestedId)
      }
    }
  }

  private func requestFullerThumbnail(asset: PHAsset, target: CGSize, requestedId: String) {
    let options = PHImageRequestOptions()
    options.deliveryMode = .opportunistic
    options.resizeMode = .fast
    options.isNetworkAccessAllowed = true
    options.isSynchronous = false
    requestId = PHImageManager.default().requestImage(
      for: asset,
      targetSize: target,
      contentMode: .aspectFill,
      options: options
    ) { [weak self] image, info in
      let cancelled = (info?[PHImageCancelledKey] as? Bool) ?? false
      DispatchQueue.main.async {
        guard let self, self.assetId == requestedId, !cancelled, let image else {
          return
        }
        self.imageView.image = image
      }
    }
  }
}
