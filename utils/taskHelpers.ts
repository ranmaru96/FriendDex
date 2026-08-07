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

/** YYYY-MM-DD → 同年は `M/D`、他年は `YY/M/D`（月日はゼロ埋めなし） */
export function formatTaskDueDateLabel(dueDateYmd: string, asOf: Date = new Date()): string {
  if (!dueDateYmd) return '';
  const [y, m, d] = dueDateYmd.split('-').map((part) => Number(part));
  if (!y || !m || !d) return '';
  const md = `${m}/${d}`;
  if (y === asOf.getFullYear()) return md;
  return `${String(y % 100).padStart(2, '0')}/${md}`;
}

export type TaskDueUrgency = 'overdue' | 'today' | 'upcoming';

export function getTaskDueUrgency(dueDateYmd: string, asOf: Date = new Date()): TaskDueUrgency {
  const today = toYmd(asOf);
  if (dueDateYmd < today) return 'overdue';
  if (dueDateYmd === today) return 'today';
  return 'upcoming';
}

export type RecentSevenDayItem = {
  ymd: string;
  label: string;
  done: boolean;
  /** 右端スロットの日付が「今日」のとき true（わっか表示） */
  isToday: boolean;
};

/** 左が古く、右が今日の直近7暦日（フォールバック） */
export function getRecentSevenDayItems(
  completedOnSet: Set<string>,
  asOf: Date = new Date()
): RecentSevenDayItem[] {
  return Array.from({ length: 7 }, (_, index) => {
    const offset = index - 6;
    const date = addDays(asOf, offset);
    const ymd = toYmd(date);
    return {
      ymd,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      done: completedOnSet.has(ymd),
      isToday: offset === 0,
    };
  });
}

/**
 * 予定出現日ベースの直近7スロット。
 * 右端＝今日以前の最新予定日。わっかはその日が今日のときだけ。
 */
export function getRecentScheduledDotItems(
  task: TaskScheduleLike,
  completedOnSet: Set<string>,
  asOf: Date = new Date(),
  count = 7
): RecentSevenDayItem[] {
  const newestFirst = collectPastDueDates(task, asOf, count);
  const chronological = [...newestFirst].reverse();
  const todayYmd = toYmd(asOf);
  return chronological.map((ymd) => {
    const date = parseYmd(ymd);
    return {
      ymd,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      done: completedOnSet.has(ymd),
      isToday: ymd === todayYmd,
    };
  });
}

/** グループ: メンバ予定日の和集合で直近 maxCount 日（新しい順） */
export function collectPastGroupDueDates(
  members: TaskScheduleLike[],
  asOf: Date,
  maxCount: number
): string[] {
  if (members.length === 0) {
    return [];
  }
  const dates: string[] = [];
  let cursor = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  let guard = 0;
  while (dates.length < maxCount && guard < 800) {
    if (members.some((member) => isRecurringDueOnDate(member, cursor))) {
      dates.push(toYmd(cursor));
    }
    cursor = addDays(cursor, -1);
    guard += 1;
  }
  return dates;
}

export function getRecentGroupScheduledDotItems(
  members: TaskScheduleLike[],
  completedOnSet: Set<string>,
  asOf: Date = new Date(),
  count = 7
): RecentSevenDayItem[] {
  const newestFirst = collectPastGroupDueDates(members, asOf, count);
  const chronological = [...newestFirst].reverse();
  const todayYmd = toYmd(asOf);
  return chronological.map((ymd) => {
    const date = parseYmd(ymd);
    return {
      ymd,
      label: `${date.getMonth() + 1}/${date.getDate()}`,
      done: completedOnSet.has(ymd),
      isToday: ymd === todayYmd,
    };
  });
}

export type TaskRecurrenceUnit = 'day' | 'week' | 'month' | 'year';

export type TaskRecurrenceConfig = {
  /** JS getDay(): 0=Sun … 6=Sat. Empty = 曜日指定無（毎週・毎日出現） */
  weekdays?: number[];
  /** Week boundary start. Default 1 (Mon). Unused when weekdays is empty. */
  weekStartsOn?: number;
  monthDay?: number;
  /** @deprecated use monthNths */
  monthNth?: number;
  /** @deprecated use monthWeekdays */
  monthWeekday?: number;
  /** 1–4, or 5 = last */
  monthNths?: number[];
  monthWeekdays?: number[];
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

export function resolveMonthNths(config: TaskRecurrenceConfig): number[] {
  if (config.monthNths?.length) {
    return config.monthNths;
  }
  if (config.monthNth != null) {
    return [config.monthNth];
  }
  return [];
}

export function resolveMonthWeekdays(config: TaskRecurrenceConfig): number[] {
  if (config.monthWeekdays?.length) {
    return config.monthWeekdays;
  }
  if (config.monthWeekday != null) {
    return [config.monthWeekday];
  }
  return [];
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
    // 曜日指定無 → 毎日出現
    if (weekdays.length === 0) {
      return true;
    }
    return weekdays.includes(date.getDay());
  }

  if (unit === 'month') {
    if (config.monthDay != null) {
      const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
      const target = Math.min(config.monthDay, lastDay);
      return date.getDate() === target;
    }
    const nths = resolveMonthNths(config);
    const weekdays = resolveMonthWeekdays(config);
    if (nths.length === 0 || weekdays.length === 0) {
      return false;
    }
    for (const nth of nths) {
      for (const weekday of weekdays) {
        const day = nthWeekdayOfMonth(date.getFullYear(), date.getMonth(), weekday, nth);
        if (day != null && date.getDate() === day) {
          return true;
        }
      }
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

/** Latest completion YYYY-MM-DD in the set, or null if empty */
export function getLastCompletionYmd(completedOnSet: Set<string>): string | null {
  let latest: string | null = null;
  for (const ymd of completedOnSet) {
    if (latest == null || ymd > latest) {
      latest = ymd;
    }
  }
  return latest;
}

/** Calendar-day difference: asOfYmd - pastYmd (non-negative when asOf >= past) */
export function daysBetweenYmd(pastYmd: string, asOfYmd: string): number {
  const past = parseYmd(pastYmd);
  const asOf = parseYmd(asOfYmd);
  const ms = asOf.getTime() - past.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Recurring list meta: show streak while consecutive; otherwise days since last completion.
 * Examples: "連続3" / "5日前" / "今日" / ""
 */
export function formatRecurringActivityLabel(
  task: TaskScheduleLike,
  completedOnSet: Set<string>,
  asOf: Date = new Date()
): string {
  const streak = calculateScheduledStreak(task, completedOnSet, asOf);
  if (streak > 0) {
    return `連続${streak}`;
  }
  const lastYmd = getLastCompletionYmd(completedOnSet);
  if (!lastYmd) {
    return '';
  }
  const daysAgo = daysBetweenYmd(lastYmd, toYmd(asOf));
  if (daysAgo <= 0) {
    return '今日';
  }
  return `${daysAgo}日前`;
}

export function formatRecurrenceLabel(
  pace: 'scheduled' | 'unpaced' | null,
  unit: TaskRecurrenceUnit | null,
  config: TaskRecurrenceConfig | null
): string {
  if (pace === 'unpaced') {
    return '';
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
    const nths = resolveMonthNths(c);
    const weekdays = resolveMonthWeekdays(c);
    if (nths.length > 0 && weekdays.length > 0) {
      const nthPart = nths
        .slice()
        .sort((a, b) => a - b)
        .map((n) => (n === 5 ? '最終' : `第${n}`))
        .join('・');
      const dayPart = weekdays
        .slice()
        .sort((a, b) => a - b)
        .map((d) => weekdayLabels[d] ?? '?')
        .join('・');
      return `毎月${nthPart}${dayPart}`;
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

export const MONTH_NTH_OPTIONS: { label: string; value: number }[] = [
  { label: '第1', value: 1 },
  { label: '第2', value: 2 },
  { label: '第3', value: 3 },
  { label: '第4', value: 4 },
  { label: '最終', value: 5 },
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
