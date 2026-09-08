import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase, closeDatabase } from '../src/database/db';
import { addOfficer } from '../src/database/officers';
import {
  startSession,
  endSession,
  getActiveSession,
  getOfficerStats,
  getOfficerSessionHistory,
} from '../src/database/sessions';

describe('Officer Sessions Lifecycle', () => {
  beforeEach(() => {
    closeDatabase();
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
  });

  it('should start a session when officer appears online', () => {
    const officer = addOfficer('John_Smith');
    const startIso = '2026-09-08T10:00:00.000Z';

    const session = startSession(officer.id, startIso);
    expect(session.id).toBeGreaterThan(0);
    expect(session.officer_id).toBe(officer.id);
    expect(session.started_at).toBe(startIso);
    expect(session.ended_at).toBeNull();

    const active = getActiveSession(officer.id);
    expect(active?.id).toBe(session.id);
  });

  it('should continue existing session without creating duplicate if called again', () => {
    const officer = addOfficer('John_Smith');
    const startIso = '2026-09-08T10:00:00.000Z';

    const session1 = startSession(officer.id, startIso);
    const session2 = startSession(officer.id, '2026-09-08T10:05:00.000Z');

    expect(session1.id).toBe(session2.id);
    expect(session2.started_at).toBe(startIso);
  });

  it('should cleanly end a session and calculate duration in seconds', () => {
    const officer = addOfficer('John_Smith');
    const startIso = '2026-09-08T10:00:00.000Z';
    const endIso = '2026-09-08T12:15:30.000Z'; // 2 hours, 15 minutes, 30 seconds = 8130s

    startSession(officer.id, startIso);
    const ended = endSession(officer.id, 'DISCONNECTED', endIso);

    expect(ended).not.toBeNull();
    expect(ended?.ended_at).toBe(endIso);
    expect(ended?.duration_seconds).toBe(8130);
    expect(ended?.end_reason).toBe('DISCONNECTED');

    expect(getActiveSession(officer.id)).toBeNull();
  });

  it('should track multiple sessions in one day and sum totals accurately', () => {
    const officer = addOfficer('John_Smith');

    // Session 1: 10:00 -> 12:00 (2h = 7200s)
    startSession(officer.id, '2026-09-08T04:30:00.000Z'); // 10:00 IST
    endSession(officer.id, 'DISCONNECTED', '2026-09-08T06:30:00.000Z'); // 12:00 IST

    // Session 2: 15:00 -> 17:30 (2h30m = 9000s)
    startSession(officer.id, '2026-09-08T09:30:00.000Z'); // 15:00 IST
    endSession(officer.id, 'DISCONNECTED', '2026-09-08T12:00:00.000Z'); // 17:30 IST

    // Session 3: 20:00 -> 21:00 (1h = 3600s)
    startSession(officer.id, '2026-09-08T14:30:00.000Z'); // 20:00 IST
    endSession(officer.id, 'DISCONNECTED', '2026-09-08T15:30:00.000Z'); // 21:00 IST

    const history = getOfficerSessionHistory(officer.id);
    expect(history.length).toBe(3);

    const stats = getOfficerStats(officer.id, officer.ig_name, false);
    // Lifetime = 7200 + 9000 + 3600 = 19800s (5h 30m)
    expect(stats.lifetimeSeconds).toBe(19800);
  });
});
