import type { Href } from 'expo-router';

export const CALENDAR_ROOT = '/' as const;
export const CALENDAR_ALIAS = '/calendar' as const;
export const PEOPLE_ROOT = '/people' as const;

const CALENDAR_DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDateKey(value: string): boolean {
  return CALENDAR_DATE_KEY.test(value);
}

export function isCalendarTabRoot(pathname: string): boolean {
  return pathname === '/' || pathname === '/index' || pathname === '/calendar';
}

export function isPeopleTabRoot(pathname: string): boolean {
  return pathname === '/people';
}

export function calendarHref(date?: string): Href {
  const trimmed = typeof date === 'string' ? date.trim() : '';
  if (isCalendarDateKey(trimmed)) {
    return { pathname: '/', params: { date: trimmed } };
  }
  return '/';
}
