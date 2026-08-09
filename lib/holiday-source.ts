// External sources for Indonesian national holidays.
// Primary: Google Calendar public ICS feed (multi-year, distinguishes public
// holidays from observances). Fallback: guangrei/APIHariLibur_V2 JSON dataset
// (current year only). The previous source, libur.deno.dev, is dead
// (Deno Deploy Classic sunset July 2026).

export interface ExternalHoliday {
    /** YYYY-MM-DD */
    date: string;
    name: string;
}

const GOOGLE_ICS_URL =
    'https://calendar.google.com/calendar/ical/en.indonesian%23holiday%40group.v.calendar.google.com/public/basic.ics';
const GUANGREI_JSON_URL =
    'https://raw.githubusercontent.com/guangrei/APIHariLibur_V2/main/calendar.json';

const FETCH_TIMEOUT_MS = 15000;

/** Parse Google Calendar ICS and keep only public holidays for the given year. */
function parseGoogleIcs(ics: string, year: number): ExternalHoliday[] {
    const holidays: ExternalHoliday[] = [];
    const events = ics.split('BEGIN:VEVENT').slice(1);

    for (const event of events) {
        const dateMatch = event.match(/DTSTART;VALUE=DATE:(\d{4})(\d{2})(\d{2})/);
        const summaryMatch = event.match(/SUMMARY:(.*)/);
        const descMatch = event.match(/DESCRIPTION:(.*)/);
        if (!dateMatch || !summaryMatch) continue;

        if (parseInt(dateMatch[1]) !== year) continue;

        // Skip observances (Ramadan Start, New Year's Eve, ...) — only actual
        // public holidays reduce working days.
        const description = (descMatch?.[1] ?? '').trim();
        if (!description.startsWith('Public holiday')) continue;

        holidays.push({
            date: `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
            name: summaryMatch[1].trim().replace(/\\,/g, ','),
        });
    }

    return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchFromGoogleIcs(year: number): Promise<ExternalHoliday[]> {
    const response = await fetch(GOOGLE_ICS_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`Google Calendar ICS returned ${response.status}`);
    return parseGoogleIcs(await response.text(), year);
}

async function fetchFromGuangrei(year: number): Promise<ExternalHoliday[]> {
    const response = await fetch(GUANGREI_JSON_URL, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`Holiday dataset returned ${response.status}`);

    const data: Record<string, { holiday?: boolean; summary?: string[] }> = await response.json();
    const holidays: ExternalHoliday[] = [];
    for (const [date, info] of Object.entries(data)) {
        if (!date.startsWith(`${year}-`)) continue;
        if (!info?.holiday) continue;
        holidays.push({ date, name: info.summary?.[0] ?? 'Hari libur nasional' });
    }
    return holidays.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fetch Indonesian national holidays for a year from external sources.
 * Tries Google Calendar ICS first, then the guangrei dataset.
 * Returns [] when no source has data (e.g. a future year whose official
 * SKB holiday decree hasn't been published yet).
 */
export async function fetchIndonesianHolidays(year: number): Promise<ExternalHoliday[]> {
    try {
        const fromIcs = await fetchFromGoogleIcs(year);
        if (fromIcs.length > 0) return fromIcs;
    } catch (error) {
        console.error(`Google ICS holiday fetch failed for ${year}:`, error);
    }

    try {
        return await fetchFromGuangrei(year);
    } catch (error) {
        console.error(`Fallback holiday fetch failed for ${year}:`, error);
        return [];
    }
}
