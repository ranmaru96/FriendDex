import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import type { EventNotificationData } from '@/utils/eventNotifications';
import { ensureNotificationInfrastructure } from '@/utils/eventNotifications';
import { isTaskNotificationData } from '@/utils/taskNotifications';
import { detailHref, detailPathname } from '@/utils/detailPaths';
import { claimNotificationNavigation } from '@/utils/navigationRestore';
import { calendarHref, isCalendarDateKey, isCalendarTabRoot } from '@/utils/tabRoots';

let consumedNotificationKey: string | null = null;

const notificationResponseKey = (response: Notifications.NotificationResponse): string =>
  [
    response.notification.request.identifier,
    String(response.notification.date ?? ''),
    response.actionIdentifier,
  ].join(':');

const consumeNotificationResponse = (response: Notifications.NotificationResponse): boolean => {
  const key = notificationResponseKey(response);
  if (consumedNotificationKey === key) {
    return false;
  }
  consumedNotificationKey = key;
  Notifications.clearLastNotificationResponse();
  return true;
};

const isEventNotificationData = (value: unknown): value is EventNotificationData => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const data = value as Partial<EventNotificationData>;
  return typeof data.eventId === 'string' && typeof data.calendarDate === 'string';
};

export function EventNotificationHandler() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    void ensureNotificationInfrastructure();

    const navigateFromNotification = (response: Notifications.NotificationResponse) => {
      if (!consumeNotificationResponse(response)) {
        return;
      }
      const rawData = response.notification.request.content.data;
      if (isTaskNotificationData(rawData)) {
        claimNotificationNavigation('/tasks');
        router.push('/tasks');
        return;
      }

      if (!isEventNotificationData(rawData)) {
        return;
      }

      const friendId = rawData.friendId?.trim() ?? '';
      if (friendId) {
        claimNotificationNavigation(detailPathname('person', 'home'));
        router.push(detailHref('person', 'home', { id: friendId }));
        return;
      }

      const date = rawData.calendarDate.trim();
      claimNotificationNavigation('/');
      if (isCalendarTabRoot(pathnameRef.current) && isCalendarDateKey(date)) {
        router.setParams({ date });
        return;
      }
      router.replace(calendarHref(date));
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
