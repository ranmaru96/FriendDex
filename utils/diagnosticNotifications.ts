/** 診断用: 起動時は import せず、ボタンで初めて expo-notifications を載せる。 */
export const diagnosticRegisterNotificationHandler = (): void => {
  const Notifications = require('expo-notifications') as typeof import('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
};
