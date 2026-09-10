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

const getScheme = () => {
  if (IS_DEV) return 'frienddexdev';
  if (IS_PREVIEW) return 'frienddexpreview';
  return 'frienddex';
};

const GOOGLE_CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';

const toReversedGoogleScheme = (clientId) => {
  if (typeof clientId !== 'string' || !clientId.endsWith(GOOGLE_CLIENT_ID_SUFFIX)) {
    return null;
  }
  return `com.googleusercontent.apps.${clientId.slice(0, -GOOGLE_CLIENT_ID_SUFFIX.length)}`;
};

const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';
const googleAndroidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '';
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
const googleUrlSchemes = [
  toReversedGoogleScheme(googleIosClientId),
  toReversedGoogleScheme(googleAndroidClientId),
].filter((scheme, index, schemes) => Boolean(scheme) && schemes.indexOf(scheme) === index);

const appSchemes = [getScheme(), ...googleUrlSchemes];

export default {
  expo: {
    name: getAppName(),
    slug: "FriendDex",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: false,
    scheme: appSchemes.length === 1 ? appSchemes[0] : appSchemes,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff"
    },
    ios: {
      bundleIdentifier: getUniqueIdentifier(),
      buildNumber: "2",
      supportsTablet: false,
      infoPlist: {
        NSPhotoLibraryUsageDescription: "プロフィール写真の選択・保存などのために、写真ライブラリへのアクセスが必要になる場合があります。",
        NSCameraUsageDescription: "QRコードをスキャンして友達を登録するために、カメラへのアクセスが必要です。",
        NSUserNotificationsUsageDescription: "予定とタスクのリマインダーをお知らせするために、通知の許可が必要です。",
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
      predictiveBackGestureEnabled: false,
      ...(googleUrlSchemes.length > 0
        ? {
            intentFilters: googleUrlSchemes.map((scheme) => ({
              action: 'VIEW',
              category: ['BROWSABLE', 'DEFAULT'],
              data: [{ scheme }],
            })),
          }
        : {}),
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      [
        "expo-dev-client",
        {
          addGeneratedScheme: !!IS_DEV,
        },
      ],
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
      ],
      "expo-web-browser",
      "expo-secure-store",
      [
        "@sentry/react-native",
        {
          organization: "iwamotoranmaru",
          project: "frienddex",
        },
      ],
      "./plugins/withStripSentryPropertiesUrl",
    ],
    extra: {
      router: {},
      eas: {
        projectId: "90a1981c-5ddc-4093-ab07-1537c283e285"
      },
      googleIosClientId,
      googleAndroidClientId,
      googleWebClientId
    },
    owner: "ranmaru96"
  }
};
