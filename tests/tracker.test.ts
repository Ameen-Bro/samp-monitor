import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDatabase, closeDatabase } from '../src/database/db';
import { addOfficer } from '../src/database/officers';
import { startSession, getActiveSession } from '../src/database/sessions';
import { reconcileOnRestart } from '../src/tracking/recovery';
import { SampTracker } from '../src/tracking/tracker';
import * as queryModule from '../src/samp/query';
import { SampServerStatus, ServerPlayer } from '../src/samp/types';

describe('Tracker & Missed Query Protection', () => {
  beforeEach(() => {
    closeDatabase();
    initDatabase(':memory:');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    closeDatabase();
    vi.restoreAllMocks();
  });

  it('should reconcile active sessions on bot restart without creating duplicates', () => {
    const off1 = addOfficer('John_Smith');
    const off2 = addOfficer('Mike_Officer');
    const off3 = addOfficer('Alex_PD');

    // Before restart: John and Mike have open sessions
    startSession(off1.id, '2026-09-08T10:00:00.000Z');
    startSession(off2.id, '2026-09-08T10:00:00.000Z');

    // On restart, live query returns John and Alex online (Mike left)
    const mockPlayers: ServerPlayer[] = [
      { id: 0, name: 'John_Smith', score: 10, ping: 25 },
      { id: 1, name: 'Alex_PD', score: 5, ping: 30 },
    ];

    reconcileOnRestart(mockPlayers);

    // 1. John was online, is still online -> session continues
    const johnSession = getActiveSession(off1.id);
    expect(johnSession).not.toBeNull();
    expect(johnSession?.started_at).toBe('2026-09-08T10:00:00.000Z');

    // 2. Mike was online, is now offline -> session closed
    const mikeSession = getActiveSession(off2.id);
    expect(mikeSession).toBeNull();

    // 3. Alex had no session, is now online -> new session started
    const alexSession = getActiveSession(off3.id);
    expect(alexSession).not.toBeNull();
  });

  it('should protect sessions from transient query drops until threshold is reached', async () => {
    const off1 = addOfficer('John_Smith');
    const tracker = new SampTracker('127.0.0.1', 7777, 30, 3);

    // Mock query: Success initially with John online
    const successStatus: SampServerStatus = {
      online: true,
      ip: '127.0.0.1',
      port: 7777,
      latencyMs: 30,
      info: {
        password: false,
        players: 1,
        maxPlayers: 100,
        hostname: 'Mock Server',
        gamemode: 'RP',
        mapname: 'SA',
      },
      players: [{ id: 0, name: 'John_Smith', score: 5, ping: 20 }],
      lastQueriedAt: new Date(),
    };

    const failStatus: SampServerStatus = {
      online: false,
      ip: '127.0.0.1',
      port: 7777,
      latencyMs: -1,
      players: [],
      lastQueriedAt: new Date(),
      error: 'UDP packet timed out',
    };

    // 1. Initial query succeeds
    vi.spyOn(queryModule, 'querySampServer').mockResolvedValueOnce(successStatus);
    await tracker.checkNow();
    expect(getActiveSession(off1.id)).not.toBeNull();
    expect(tracker.getConsecutiveFailures()).toBe(0);

    // 2. Query #1 fails -> should NOT mark offline
    vi.spyOn(queryModule, 'querySampServer').mockResolvedValueOnce(failStatus);
    await tracker.checkNow();
    expect(getActiveSession(off1.id)).not.toBeNull();
    expect(tracker.getConsecutiveFailures()).toBe(1);

    // 3. Query #2 fails -> should NOT mark offline
    vi.spyOn(queryModule, 'querySampServer').mockResolvedValueOnce(failStatus);
    await tracker.checkNow();
    expect(getActiveSession(off1.id)).not.toBeNull();
    expect(tracker.getConsecutiveFailures()).toBe(2);

    // 4. Query #3 fails -> reaches threshold (3) -> marks offline
    vi.spyOn(queryModule, 'querySampServer').mockResolvedValueOnce(failStatus);
    await tracker.checkNow();
    expect(tracker.getConsecutiveFailures()).toBe(3);
    expect(getActiveSession(off1.id)).toBeNull(); // Session ended with SERVER_UNREACHABLE
  });

  it('should reset consecutive failure count if a subsequent query succeeds', async () => {
    const off1 = addOfficer('John_Smith');
    const tracker = new SampTracker('127.0.0.1', 7777, 30, 3);

    const successStatus: SampServerStatus = {
      online: true,
      ip: '127.0.0.1',
      port: 7777,
      latencyMs: 30,
      info: { password: false, players: 1, maxPlayers: 100, hostname: 'Mock', gamemode: 'RP', mapname: 'SA' },
      players: [{ id: 0, name: 'John_Smith', score: 5, ping: 20 }],
      lastQueriedAt: new Date(),
    };

    const failStatus: SampServerStatus = {
      online: false,
      ip: '127.0.0.1',
      port: 7777,
      latencyMs: -1,
      players: [],
      lastQueriedAt: new Date(),
      error: 'Timeout',
    };

    vi.spyOn(queryModule, 'querySampServer')
      .mockResolvedValueOnce(successStatus)
      .mockResolvedValueOnce(failStatus)
      .mockResolvedValueOnce(successStatus);

    await tracker.checkNow();
    expect(tracker.getConsecutiveFailures()).toBe(0);

    await tracker.checkNow();
    expect(tracker.getConsecutiveFailures()).toBe(1);

    await tracker.checkNow();
    expect(tracker.getConsecutiveFailures()).toBe(0);
    expect(getActiveSession(off1.id)).not.toBeNull();
  });
});
