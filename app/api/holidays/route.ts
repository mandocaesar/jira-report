import { getHolidaysForYear, getHolidaysInRange } from '@/lib/holiday-service';
import { apiSuccess, apiError } from '@/lib/api-helpers';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const year = searchParams.get('year');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');

        let holidays;

        if (year) {
            // Fetch holidays for a specific year
            holidays = await getHolidaysForYear(parseInt(year, 10));
        } else if (startDate && endDate) {
            // Fetch holidays for a date range
            holidays = await getHolidaysInRange(
                new Date(startDate),
                new Date(endDate)
            );
        } else {
            // Default to current year
            const currentYear = new Date().getFullYear();
            holidays = await getHolidaysForYear(currentYear);
        }

        return apiSuccess(holidays, {
            headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
        });
    } catch (error) {
        console.error('Error fetching holidays:', error);

        return apiError(
            error instanceof Error ? error.message : 'Failed to fetch holidays'
        );
    }
}
