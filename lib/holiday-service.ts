import { Holiday, HolidayApiResponse } from '@/types';

const HOLIDAY_API_URL = 'https://libur.deno.dev/api';

// Cache for holiday data
let holidayCache: Map<number, Holiday[]> = new Map();

/**
 * Fetch Indonesian holidays for a specific year
 */
export async function getHolidaysForYear(year: number): Promise<Holiday[]> {
    // Check cache first
    if (holidayCache.has(year)) {
        return holidayCache.get(year)!;
    }

    try {
        const response = await fetch(`${HOLIDAY_API_URL}?year=${year}`, {
            next: { revalidate: 86400 }, // Cache for 24 hours
        });

        if (!response.ok) {
            throw new Error(`Holiday API error: ${response.status}`);
        }

        const data: HolidayApiResponse = await response.json();
        const holidays = data.data || [];

        // Cache the result
        holidayCache.set(year, holidays);

        return holidays;
    } catch (error) {
        console.error(`Failed to fetch holidays for ${year}:`, error);
        return [];
    }
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

    return allHolidays.filter(holiday => {
        const holidayDate = new Date(holiday.holiday_date);
        return holidayDate >= startDate && holidayDate <= endDate;
    });
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 = Sunday, 6 = Saturday
}

/**
 * Check if a date is a holiday
 */
export function isHoliday(date: Date, holidays: Holiday[]): boolean {
    const dateStr = date.toISOString().split('T')[0];
    return holidays.some(holiday => holiday.holiday_date === dateStr);
}

/**
 * Calculate working days between two dates (excluding weekends and Indonesian holidays)
 */
export async function calculateWorkingDays(startDate: Date, endDate: Date): Promise<number> {
    const holidays = await getHolidaysInRange(startDate, endDate);

    let workingDays = 0;
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        if (!isWeekend(currentDate) && !isHoliday(currentDate, holidays)) {
            workingDays++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return workingDays;
}

/**
 * Get list of working dates in a range
 */
export async function getWorkingDates(startDate: Date, endDate: Date): Promise<Date[]> {
    const holidays = await getHolidaysInRange(startDate, endDate);

    const workingDates: Date[] = [];
    const currentDate = new Date(startDate);

    while (currentDate <= endDate) {
        if (!isWeekend(currentDate) && !isHoliday(currentDate, holidays)) {
            workingDates.push(new Date(currentDate));
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return workingDates;
}
