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
  /** 止まったあとに差し替える画質。fastFormat は指定サイズより粗いことがある。 */
  let highOptions: PHImageRequestOptions = {
    let options = PHImageRequestOptions()
    options.deliveryMode = .highQualityFormat
    options.resizeMode = .fast
    options.version = .current
    options.isNetworkAccessAllowed = true
    options.isSynchronous = false
    return options
  }()

  private struct Slot {
    var assets: [PHAsset] = []
    var target = CGSize.zero
  }

  private var fastSlot = Slot()
  private var highSlot = Slot()

  func prepare(ids: [String], pixelSize: CGFloat, high: Bool) {
    let target = CGSize(width: max(pixelSize, 1), height: max(pixelSize, 1))
    let limited = Array(ids.prefix(120))
    let fetched = PHAsset.fetchAssets(withLocalIdentifiers: limited, options: nil)
    var next: [PHAsset] = []
    next.reserveCapacity(fetched.count)
    fetched.enumerateObjects { asset, _, _ in
      next.append(asset)
    }
    let requestOptions = high ? highOptions : options
    let previous = high ? highSlot : fastSlot
    if !previous.assets.isEmpty {
      manager.stopCachingImages(
        for: previous.assets,
        targetSize: previous.target,
        contentMode: .aspectFill,
        options: requestOptions
      )
    }
    if !next.isEmpty {
      manager.startCachingImages(
        for: next,
        targetSize: target,
        contentMode: .aspectFill,
        options: requestOptions
      )
    }
    if high {
      highSlot = Slot(assets: next, target: target)
    } else {
      fastSlot = Slot(assets: next, target: target)
    }
  }
}
