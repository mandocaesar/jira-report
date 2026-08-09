import { Holiday } from '@/types';
import { apiCache } from './cache';
import { prisma, isDatabaseAvailable } from './db';
import { fetchIndonesianHolidays } from './holiday-source';

/**
 * Fetch Indonesian holidays for a specific year.
 * Primary source is the DB Holiday table (managed in Settings → Holidays);
 * external sources are only a fallback when the DB has no rows for the year.
 * Uses apiCache with getOrFetch for stampede protection (24h TTL).
 */
export async function getHolidaysForYear(year: number): Promise<Holiday[]> {
    return apiCache.getOrFetch(`holidays:${year}`, async () => {
        // 1. DB first — same source the capacity pipeline uses
        if (isDatabaseAvailable() && prisma) {
            try {
                const rows = await prisma.holiday.findMany({
                    where: { year, isActive: true },
                    orderBy: { date: 'asc' },
                    select: { date: true, name: true },
                });
                if (rows.length > 0) {
                    return rows.map(h => ({
                        holiday_date: toLocalDateString(h.date),
                        holiday_name: h.name,
                        is_national_holiday: true,
                    }));
                }
            } catch (error) {
                console.error(`Failed to read holidays for ${year} from DB:`, error);
            }
        }

        // 2. Fallback: external sources (Google Calendar ICS → guangrei dataset)
        const external = await fetchIndonesianHolidays(year);
        return external.map(h => ({
            holiday_date: h.date,
            holiday_name: h.name,
            is_national_holiday: true,
        }));
    }, 24 * 60 * 60 * 1000); // 24 hour TTL
}

/**
 * Get holidays for a date range
 */
export async function getHolidaysInRange(startDate: Date, endDate: Date): Promise<Holiday[]> {
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();

    const years = new Set<number>();
    for (let year = startYear; year <= endYear; year++) {
        years.add(year);
    }

    // Fetch holidays for all years in range
    const holidayPromises = Array.from(years).map(year => getHolidaysForYear(year));
    const holidayArrays = await Promise.all(holidayPromises);

    // Flatten and filter to date range
    const allHolidays = holidayArrays.flat();

    const startStr = toLocalDateString(startDate);
    const endStr = toLocalDateString(endDate);

    return allHolidays.filter(holiday => {
        return holiday.holiday_date >= startStr && holiday.holiday_date <= endStr;
    });
}

/**
 * Helper to get YYYY-MM-DD in local time to avoid UTC offset bugs
 */
export function toLocalDateString(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 * Accepts either a Date object or a YYYY-MM-DD string
 */
export function isWeekend(date: Date | string): boolean {
    let day: number;
    if (typeof date === 'string') {
        const [year, month, d] = date.split('-').map(Number);
        day = new Date(year, month - 1, d).getDay();
    } else {
        day = date.getDay();
    }
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Check if a date is a holiday
 */
export function isHoliday(date: Date, holidays: Holiday[]): boolean {
    const dateStr = toLocalDateString(date);
    return holidays.some(holiday => holiday.holiday_date === dateStr);
}

/**
 * Iterate over each calendar date from startDate to endDate (inclusive)
 * using string-based arithmetic to avoid timezone drift.
 */
function forEachDate(startDate: Date, endDate: Date, callback: (dateStr: string) => void): void {
    const startStr = toLocalDateString(startDate);
    const endStr = toLocalDateString(endDate);
    // Parse start date components to avoid timezone issues
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
 * Calculate working days between two dates (excluding weekends and Indonesian holidays)
 */
export async function calculateWorkingDays(startDate: Date, endDate: Date): Promise<number> {
    const holidays = await getHolidaysInRange(startDate, endDate);
    const holidaySet = new Set(holidays.map(h => h.holiday_date));

    let workingDays = 0;
    forEachDate(startDate, endDate, (dateStr) => {
        if (!isWeekend(dateStr) && !holidaySet.has(dateStr)) {
            workingDays++;
        }
    });

    return workingDays;
}

/**
 * Get list of working dates in a range
 */
export async function getWorkingDates(startDate: Date, endDate: Date): Promise<Date[]> {
    const holidays = await getHolidaysInRange(startDate, endDate);
    const holidaySet = new Set(holidays.map(h => h.holiday_date));

    const workingDates: Date[] = [];
    forEachDate(startDate, endDate, (dateStr) => {
        if (!isWeekend(dateStr) && !holidaySet.has(dateStr)) {
            const [y, m, d] = dateStr.split('-').map(Number);
            workingDates.push(new Date(y, m - 1, d));
        }
    });

    return workingDates;
}
