import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import type { EventNotificationData } from '@/utils/eventNotifications';
import { ensureNotificationInfrastructure } from '@/utils/eventNotifications';
import { isTaskNotificationData } from '@/utils/taskNotifications';

const isEventNotificationData = (value: unknown): value is EventNotificationData => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const data = value as Partial<EventNotificationData>;
  return typeof data.eventId === 'string' && typeof data.calendarDate === 'string';
};

export function EventNotificationHandler() {
  const router = useRouter();

  useEffect(() => {
    void ensureNotificationInfrastructure();

    const navigateFromNotification = (response: Notifications.NotificationResponse) => {
      const rawData = response.notification.request.content.data;
      if (isTaskNotificationData(rawData)) {
        router.push('/tasks');
        return;
      }

      if (!isEventNotificationData(rawData)) {
        return;
      }

      if (rawData.friendId?.trim()) {
        router.push({ pathname: '/detail', params: { id: rawData.friendId } });
        return;
      }

      router.push({ pathname: '/calendar', params: { date: rawData.calendarDate } });
    };

    const lastResponse = Notifications.getLastNotificationResponse();
    if (lastResponse) {
      navigateFromNotification(lastResponse);
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(navigateFromNotification);
    return () => subscription.remove();
  }, [router]);

  return null;
}
