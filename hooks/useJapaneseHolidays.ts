import { useCallback, useEffect, useState } from 'react';
import {
  getJapaneseHolidayName,
  loadJapaneseHolidays,
  refreshJapaneseHolidaysIfNeeded,
  type JapaneseHolidayMap,
} from '@/utils/japaneseHolidays';

export function useJapaneseHolidays(): {
  holidays: JapaneseHolidayMap;
  holidayNameFor: (dateKey: string) => string | null;
  refresh: () => void;
} {
  const [holidays, setHolidays] = useState<JapaneseHolidayMap>(loadJapaneseHolidays);

  const refresh = useCallback(() => {
    void refreshJapaneseHolidaysIfNeeded().then(setHolidays);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const holidayNameFor = useCallback(
    (dateKey: string) => getJapaneseHolidayName(dateKey, holidays),
    [holidays]
  );

  return { holidays, holidayNameFor, refresh };
}
