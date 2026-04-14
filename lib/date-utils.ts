import { toLocalDateString, isWeekend } from './holiday-service';

/**
 * Generate an array of YYYY-MM-DD date strings from startIso to endIso (inclusive).
 */
export function generateDateRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const startDate = new Date(startIso);
  const endDate = new Date(endIso);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);
  const currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    dates.push(
      `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
    );
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}

/**
 * Calculate business days between two dates (excluding weekends), minimum 1.
 */
export function businessDaysBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  let count = 0;
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endNorm = new Date(end);
  endNorm.setHours(0, 0, 0, 0);

  while (current <= endNorm) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return Math.max(count, 1);
}

/**
 * Iterate over each calendar date from startDate to endDate (inclusive),
 * using string-based arithmetic to avoid timezone drift.
 */
export function forEachDate(startDate: Date, endDate: Date, callback: (dateStr: string) => void): void {
  const startStr = toLocalDateString(startDate);
  const endStr = toLocalDateString(endDate);
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const current = new Date(sy, sm - 1, sd);
  let currentStr = startStr;

  while (currentStr <= endStr) {
    callback(currentStr);
    current.setDate(current.getDate() + 1);
    currentStr = toLocalDateString(current);
  }
}

/**
 * Count working days in a date range excluding weekends and a set of excluded dates.
 */
export function countWorkingDaysInRange(
  startStr: string,
  endStr: string,
  excludedDates: Set<string>
): number {
  let count = 0;
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  let curStr = startStr;
  while (curStr <= endStr) {
    if (!isWeekend(curStr) && !excludedDates.has(curStr)) {
      count++;
    }
    cur.setDate(cur.getDate() + 1);
    curStr = toLocalDateString(cur);
  }
  return count;
}
