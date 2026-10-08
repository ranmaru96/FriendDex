import { Redirect, useLocalSearchParams } from 'expo-router';
import { calendarHref } from '@/utils/tabRoots';

/** 互換用。本体は `/`。date クエリを引き継ぐ。 */
export default function CalendarAliasRoute() {
  const params = useLocalSearchParams<{ date?: string }>();
  const date = typeof params.date === 'string' ? params.date : '';
  return <Redirect href={calendarHref(date)} />;
}
