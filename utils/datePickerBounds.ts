/**
 * iOS UIDatePicker (spinner) can get stuck near 1970-01-01 when a picker that
 * had minimumDate/maximumDate is followed by one missing either bound.
 * Always pass both. See datetimepicker issues #835 / #962.
 */

export const DATE_PICKER_MIN = new Date(1900, 0, 1);
/** Wide upper bound when the field may be in the future. */
export const DATE_PICKER_MAX_FAR = new Date(2100, 11, 31);

/** Local calendar "today" as end-of-day so `new Date()` value is never past max. */
export function datePickerToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

export type DatePickerBounds = {
  minimumDate: Date;
  maximumDate: Date;
};

/** Past-or-today fields (birthday, etc.). */
export function pastOrTodayDatePickerBounds(
  minimumDate: Date = DATE_PICKER_MIN
): DatePickerBounds {
  return { minimumDate, maximumDate: datePickerToday() };
}

/** Unrestricted calendar range (task due, events, etc.). */
export function openRangeDatePickerBounds(
  minimumDate: Date = DATE_PICKER_MIN,
  maximumDate: Date = DATE_PICKER_MAX_FAR
): DatePickerBounds {
  return { minimumDate, maximumDate };
}
