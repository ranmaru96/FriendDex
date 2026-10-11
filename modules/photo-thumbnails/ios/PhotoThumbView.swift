import ExpoModulesCore
import Photos
import UIKit

public final class PhotoThumbView: ExpoView {
  private let imageView = UIImageView()
  private var assetId = ""
  private var pixelSize: CGFloat = 1
  private var highQuality = false
  private var loadedAssetId = ""
  private var loadedSize: CGFloat = 0
  private var loadedHigh = false
  private var requestId: PHImageRequestID?
  private var requestIsUpgrade = false

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
    assetId = next
  }

  func setPixelSize(_ next: Double) {
    pixelSize = CGFloat(max(next, 1))
  }

  func setHighQuality(_ next: Bool) {
    highQuality = next
  }

  /** props がそろってから1回だけ判断する。 */
  func applyProps() {
    if assetId != loadedAssetId {
      loadFresh()
      return
    }
    if imageView.image == nil {
      if requestId == nil {
        loadFresh()
      }
      return
    }
    // 小さくする方向や同じ画質なら、今の画像のままにする。
    let wantsUpgrade = highQuality && (!loadedHigh || pixelSize > loadedSize)
    if wantsUpgrade && !(requestId != nil && requestIsUpgrade) {
      upgrade()
    }
  }

  private func cancelRequest() {
    if let requestId {
      PhotoThumbCache.shared.manager.cancelImageRequest(requestId)
      self.requestId = nil
    }
    requestIsUpgrade = false
  }

  private func loadFresh() {
    cancelRequest()
    imageView.image = nil
    loadedAssetId = assetId
    loadedSize = 0
    loadedHigh = false
    guard !assetId.isEmpty else {
      return
    }
    guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil).firstObject else {
      return
    }
    let requestedId = assetId
    let size = pixelSize
    let target = CGSize(width: size, height: size)
    requestId = PhotoThumbCache.shared.manager.requestImage(
      for: asset,
      targetSize: target,
      contentMode: .aspectFill,
      options: PhotoThumbCache.shared.options
    ) { [weak self] image, info in
      let cancelled = (info?[PHImageCancelledKey] as? Bool) ?? false
      DispatchQueue.main.async {
        guard let self, self.loadedAssetId == requestedId, !cancelled else {
          return
        }
        self.requestId = nil
        if let image {
          self.imageView.image = image
          self.loadedSize = size
          if self.highQuality {
            self.upgrade()
          }
          return
        }
        self.requestFullerThumbnail(asset: asset, target: target, requestedId: requestedId)
      }
    }
  }

  /** 今の画像を出したまま、高画質を取りに行く。届いたら差し替える。 */
  private func upgrade() {
    cancelRequest()
    guard !loadedAssetId.isEmpty,
      let asset = PHAsset.fetchAssets(withLocalIdentifiers: [loadedAssetId], options: nil).firstObject
    else {
      return
    }
    let requestedId = loadedAssetId
    let size = pixelSize
    let target = CGSize(width: size, height: size)
    requestIsUpgrade = true
    requestId = PhotoThumbCache.shared.manager.requestImage(
      for: asset,
      targetSize: target,
      contentMode: .aspectFill,
      options: PhotoThumbCache.shared.highOptions
    ) { [weak self] image, info in
      let cancelled = (info?[PHImageCancelledKey] as? Bool) ?? false
      DispatchQueue.main.async {
        guard let self, self.loadedAssetId == requestedId, !cancelled else {
          return
        }
        self.requestId = nil
        self.requestIsUpgrade = false
        guard let image else {
          return
        }
        self.imageView.image = image
        self.loadedSize = size
        self.loadedHigh = true
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
        guard let self, self.loadedAssetId == requestedId, !cancelled, let image else {
          return
        }
        self.imageView.image = image
        self.loadedSize = target.width
      }
    }
  }
}
