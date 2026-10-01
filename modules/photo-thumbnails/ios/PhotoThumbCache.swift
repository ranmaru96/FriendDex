import Photos
import UIKit

final class PhotoThumbCache {
  static let shared = PhotoThumbCache()

  let manager = PHCachingImageManager()
  let options: PHImageRequestOptions = {
    let options = PHImageRequestOptions()
    options.deliveryMode = .fastFormat
    options.resizeMode = .fast
    options.version = .current
    options.isNetworkAccessAllowed = true
    options.isSynchronous = false
    return options
  }()

  private var cachedAssets: [PHAsset] = []
  private var cachedTarget = CGSize.zero

  func prepare(ids: [String], pixelSize: CGFloat) {
    let target = CGSize(width: max(pixelSize, 1), height: max(pixelSize, 1))
    let limited = Array(ids.prefix(120))
    let fetched = PHAsset.fetchAssets(withLocalIdentifiers: limited, options: nil)
    var next: [PHAsset] = []
    next.reserveCapacity(fetched.count)
    fetched.enumerateObjects { asset, _, _ in
      next.append(asset)
    }
    if !cachedAssets.isEmpty {
      manager.stopCachingImages(
        for: cachedAssets,
        targetSize: cachedTarget,
        contentMode: .aspectFill,
        options: options
      )
    }
    if !next.isEmpty {
      manager.startCachingImages(
        for: next,
        targetSize: target,
        contentMode: .aspectFill,
        options: options
      )
    }
    cachedAssets = next
    cachedTarget = target
  }
}
