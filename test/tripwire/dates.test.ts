import { describe, it, expect } from 'vitest';
import { isWeekend, toLocalDateString } from '@/lib/holiday-service';

describe('date utils tripwires', () => {
  it('isWeekend handles YYYY-MM-DD strings', () => {
    expect(isWeekend('2026-06-20')).toBe(true);  // Saturday
    expect(isWeekend('2026-06-22')).toBe(false); // Monday
  });
  it('UTC-midnight Date round-trips to the same calendar date (holiday shift regression)', () => {
    // DB @db.Date values come back as UTC midnight; must not shift a day
    expect(toLocalDateString(new Date('2026-08-17T00:00:00Z'))).toBe('2026-08-17');
  });
});
