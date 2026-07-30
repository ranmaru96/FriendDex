const IS_DEV = process.env.APP_VARIANT === 'development';
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

const getUniqueIdentifier = () => {
  if (IS_DEV) return 'com.ranmaru96.frienddex.dev';
  if (IS_PREVIEW) return 'com.ranmaru96.frienddex.preview';
  return 'com.ranmaru96.frienddex';
};

const getAppName = () => {
  if (IS_DEV) return 'FriendDex (Dev)';
  if (IS_PREVIEW) return 'FriendDex (Preview)';
  return 'FriendDex';
};

export default {
  expo: {
    name: getAppName(),
    slug: "FriendDex",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    scheme: "frienddex",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      bundleIdentifier: getUniqueIdentifier(),
      buildNumber: "1",
      supportsTablet: false,
      infoPlist: {
        NSPhotoLibraryUsageDescription: "プロフィール写真の選択・保存などのために、写真ライブラリへのアクセスが必要になる場合があります。",
        NSCameraUsageDescription: "QRコードをスキャンして友達を登録するために、カメラへのアクセスが必要です。",
        NSUserNotificationsUsageDescription: "予定のリマインダーをお知らせするために、通知の許可が必要です。",
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      package: getUniqueIdentifier(),
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff"
      },
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-sqlite",
      "expo-router",
      "@react-native-community/datetimepicker",
      "expo-font",
      [
        "expo-camera",
        {
          cameraPermission: "QRコードをスキャンして友達を登録するために、カメラへのアクセスが必要です。"
        }
      ],
      [
        "expo-media-library",
        {
          photosPermission: "QRコード名刺をフォトライブラリに保存するために、写真へのアクセスが必要です。",
          savePhotosPermission: "QRコード名刺をフォトライブラリに保存するために、写真の保存権限が必要です。"
        }
      ],
      [
        "expo-notifications",
        {
          icon: "./assets/icon.png",
          color: "#4E9A87"
        }
      ]
    ],
    extra: {
      router: {},
      eas: {
        projectId: "90a1981c-5ddc-4093-ab07-1537c283e285"
      }
    },
    owner: "ranmaru96"
  }
};
