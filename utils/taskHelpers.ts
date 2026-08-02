/** YYYY-MM-DD helpers and recurring task schedule / streak logic */

export function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map((part) => Number(part));
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export type TaskRecurrenceUnit = 'day' | 'week' | 'month' | 'year';

export type TaskRecurrenceConfig = {
  /** JS getDay(): 0=Sun … 6=Sat */
  weekdays?: number[];
  /** Week boundary start. Default 1 (Mon) */
  weekStartsOn?: number;
  monthDay?: number;
  /** 1–4, or 5 = last */
  monthNth?: number;
  monthWeekday?: number;
  yearMonth?: number;
  yearDay?: number;
};

export type TaskScheduleLike = {
  pace: 'scheduled' | 'unpaced' | null;
  recurrenceUnit: TaskRecurrenceUnit | null;
  recurrenceConfig: TaskRecurrenceConfig | null;
};

function nthWeekdayOfMonth(year: number, monthIndex: number, weekday: number, nth: number): number | null {
  if (nth === 5) {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    for (let day = lastDay; day >= 1; day -= 1) {
      if (new Date(year, monthIndex, day).getDay() === weekday) {
        return day;
      }
    }
    return null;
  }
  let count = 0;
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  for (let day = 1; day <= lastDay; day += 1) {
    if (new Date(year, monthIndex, day).getDay() === weekday) {
      count += 1;
      if (count === nth) {
        return day;
      }
    }
  }
  return null;
}

/** Whether this recurring task should appear on the given calendar day */
export function isRecurringDueOnDate(task: TaskScheduleLike, date: Date): boolean {
  if (task.pace === 'unpaced') {
    return true;
  }
  if (task.pace !== 'scheduled' || !task.recurrenceUnit) {
    return false;
  }
  const config = task.recurrenceConfig ?? {};
  const unit = task.recurrenceUnit;

  if (unit === 'day') {
    return true;
  }

  if (unit === 'week') {
    const weekdays = config.weekdays ?? [];
    return weekdays.includes(date.getDay());
  }

  if (unit === 'month') {
    if (config.monthDay != null) {
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const target = Math.min(config.monthDay, lastDay);
      return date.getDate() === target;
    }
    if (config.monthNth != null && config.monthWeekday != null) {
      const day = nthWeekdayOfMonth(
        date.getFullYear(),
        date.getMonth(),
        config.monthWeekday,
        config.monthNth
      );
      return day != null && date.getDate() === day;
    }
    return false;
  }

  if (unit === 'year') {
    const month = config.yearMonth;
    const day = config.yearDay;
    if (month == null || day == null) {
      return false;
    }
    if (date.getMonth() + 1 !== month) {
      return false;
    }
    const lastDay = new Date(date.getFullYear(), month, 0).getDate();
    return date.getDate() === Math.min(day, lastDay);
  }

  return false;
}

/** Scheduled appearance dates from endDate walking backward, inclusive, up to maxCount */
export function collectPastDueDates(
  task: TaskScheduleLike,
  endDate: Date,
  maxCount: number
): string[] {
  if (task.pace === 'unpaced') {
    const dates: string[] = [];
    for (let i = 0; i < maxCount; i += 1) {
      dates.push(toYmd(addDays(endDate, -i)));
    }
    return dates;
  }

  const dates: string[] = [];
  let cursor = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  let guard = 0;
  while (dates.length < maxCount && guard < 800) {
    if (isRecurringDueOnDate(task, cursor)) {
      dates.push(toYmd(cursor));
    }
    cursor = addDays(cursor, -1);
    guard += 1;
  }
  return dates;
}

/**
 * Streak = consecutive scheduled appearance days completed (walking backward from asOf).
 * For unpaced, appearance = every calendar day with at most one completion/day.
 */
export function calculateScheduledStreak(
  task: TaskScheduleLike,
  completedOnSet: Set<string>,
  asOf: Date = new Date()
): number {
  const dueDates = collectPastDueDates(task, asOf, 400);
  let streak = 0;
  for (const ymd of dueDates) {
    if (completedOnSet.has(ymd)) {
      streak += 1;
    } else if (ymd === toYmd(asOf)) {
      continue;
    } else {
      break;
    }
  }
  return streak;
}

export function formatRecurrenceLabel(
  pace: 'scheduled' | 'unpaced' | null,
  unit: TaskRecurrenceUnit | null,
  config: TaskRecurrenceConfig | null
): string {
  if (pace === 'unpaced') {
    return 'ペースなし';
  }
  if (pace !== 'scheduled' || !unit) {
    return '定期';
  }
  const c = config ?? {};
  const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
  if (unit === 'day') {
    return '毎日';
  }
  if (unit === 'week') {
    const days = (c.weekdays ?? []).slice().sort((a, b) => a - b);
    if (days.length === 0) {
      return '毎週';
    }
    return `毎週${days.map((d) => weekdayLabels[d] ?? '?').join('・')}`;
  }
  if (unit === 'month') {
    if (c.monthDay != null) {
      return `毎月${c.monthDay}日`;
    }
    if (c.monthNth != null && c.monthWeekday != null) {
      const nthLabel = c.monthNth === 5 ? '最終' : `第${c.monthNth}`;
      return `毎月${nthLabel}${weekdayLabels[c.monthWeekday] ?? '?'}`;
    }
    return '毎月';
  }
  if (unit === 'year' && c.yearMonth != null && c.yearDay != null) {
    return `毎年${c.yearMonth}/${c.yearDay}`;
  }
  return '毎年';
}

export const WEEKDAY_OPTIONS: { label: string; value: number }[] = [
  { label: '日', value: 0 },
  { label: '月', value: 1 },
  { label: '火', value: 2 },
  { label: '水', value: 3 },
  { label: '木', value: 4 },
  { label: '金', value: 5 },
  { label: '土', value: 6 },
];

export type CompletedTaskRetention = '1w' | '1m' | '3m' | '1y' | 'forever';

export const COMPLETED_TASK_RETENTION_OPTIONS: {
  value: CompletedTaskRetention;
  label: string;
}[] = [
  { value: '1w', label: '1週間' },
  { value: '1m', label: '1か月' },
  { value: '3m', label: '3か月' },
  { value: '1y', label: '1年' },
  { value: 'forever', label: '永続' },
];

export function retentionToCutoffIso(retention: CompletedTaskRetention, now = new Date()): string | null {
  if (retention === 'forever') {
    return null;
  }
  const cutoff = new Date(now.getTime());
  if (retention === '1w') {
    cutoff.setDate(cutoff.getDate() - 7);
  } else if (retention === '1m') {
    cutoff.setMonth(cutoff.getMonth() - 1);
  } else if (retention === '3m') {
    cutoff.setMonth(cutoff.getMonth() - 3);
  } else if (retention === '1y') {
    cutoff.setFullYear(cutoff.getFullYear() - 1);
  }
  return cutoff.toISOString();
}
