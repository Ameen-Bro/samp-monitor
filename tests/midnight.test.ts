import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { splitSessionAcrossDays, calculateOverlapSeconds, getDayBoundsInTz } from '../src/utils/time';
import { initDatabase, closeDatabase } from '../src/database/db';
import { addOfficer } from '../src/database/officers';
import { startSession, endSession, getDailyAttendance } from '../src/database/sessions';

describe('Midnight Session Splitting (Asia/Kolkata)', () => {
  beforeEach(() => {
    closeDatabase();
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
  });

  it('should split a 23:00 to 01:00 IST session into exactly 1h on Day 1 and 1h on Day 2', () => {
    // 2026-09-08 23:00:00 IST = 2026-09-08 17:30:00 UTC
    const startUtc = new Date('2026-09-08T17:30:00.000Z');
    // 2026-09-09 01:00:00 IST = 2026-09-08 19:30:00 UTC
    const endUtc = new Date('2026-09-08T19:30:00.000Z');

    const slices = splitSessionAcrossDays(startUtc, endUtc, 'Asia/Kolkata');

    expect(slices.length).toBe(2);

    expect(slices[0].dateKey).toBe('2026-09-08');
    expect(slices[0].seconds).toBe(3600); // 1 hour

    expect(slices[1].dateKey).toBe('2026-09-09');
    expect(slices[1].seconds).toBe(3600); // 1 hour
  });

  it('should accurately calculate daily attendance across midnight in SQLite database', () => {
    const officer = addOfficer('John_Smith');

    // Start at 23:00 IST on 2026-09-08
    startSession(officer.id, '2026-09-08T17:30:00.000Z');
    // End at 01:00 IST on 2026-09-09
    endSession(officer.id, 'DISCONNECTED', '2026-09-08T19:30:00.000Z');

    const day1Attendance = getDailyAttendance('2026-09-08');
    const day2Attendance = getDailyAttendance('2026-09-09');

    expect(day1Attendance.length).toBe(1);
    expect(day1Attendance[0].igName).toBe('John_Smith');
    expect(day1Attendance[0].totalSeconds).toBe(3600); // 1 hour for Sept 8

    expect(day2Attendance.length).toBe(1);
    expect(day2Attendance[0].igName).toBe('John_Smith');
    expect(day2Attendance[0].totalSeconds).toBe(3600); // 1 hour for Sept 9
  });

  it('should handle sessions that span 3 days correctly', () => {
    // 2026-09-01 22:00 IST to 2026-09-03 03:00 IST
    // 2026-09-01 22:00 IST = 2026-09-01 16:30 UTC
    // 2026-09-03 03:00 IST = 2026-09-02 21:30 UTC
    const startUtc = new Date('2026-09-01T16:30:00.000Z');
    const endUtc = new Date('2026-09-02T21:30:00.000Z');

    const slices = splitSessionAcrossDays(startUtc, endUtc, 'Asia/Kolkata');

    expect(slices.length).toBe(3);
    expect(slices[0].dateKey).toBe('2026-09-01');
    expect(slices[0].seconds).toBe(2 * 3600); // 2 hours

    expect(slices[1].dateKey).toBe('2026-09-02');
    expect(slices[1].seconds).toBe(24 * 3600); // Full 24 hours

    expect(slices[2].dateKey).toBe('2026-09-03');
    expect(slices[2].seconds).toBe(3 * 3600); // 3 hours
  });
});
