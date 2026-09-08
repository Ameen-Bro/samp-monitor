import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase, closeDatabase } from '../src/database/db';
import { addOfficer } from '../src/database/officers';
import { startSession, endSession, getOfficerStats } from '../src/database/sessions';
import { formatDuration, getTodayBounds } from '../src/utils/time';
import { buildLeaderboardEmbed, buildPeriodEmbed } from '../src/discord/dashboard';

describe('Statistics, Leaderboard & Aggregations', () => {
  beforeEach(() => {
    closeDatabase();
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
  });

  it('should format durations properly', () => {
    expect(formatDuration(0)).toBe('0m');
    expect(formatDuration(45)).toBe('45s');
    expect(formatDuration(120)).toBe('2m');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3665)).toBe('1h 1m');
    expect(formatDuration(5040)).toBe('1h 24m');
  });

  it('should compute today, week, month and lifetime stats accurately', () => {
    const officer = addOfficer('John_Smith');
    const { start: todayStart } = getTodayBounds();

    // Session 1: 1 hour earlier today
    const s1Start = new Date(todayStart.getTime() + 1000 * 3600).toISOString();
    const s1End = new Date(todayStart.getTime() + 2000 * 3600).toISOString();
    startSession(officer.id, s1Start);
    endSession(officer.id, 'DISCONNECTED', s1End);

    const stats = getOfficerStats(officer.id, officer.ig_name, false);

    expect(stats.todaySeconds).toBe(3600);
    expect(stats.weekSeconds).toBe(3600);
    expect(stats.monthSeconds).toBe(3600);
    expect(stats.lifetimeSeconds).toBe(3600);
  });

  it('should rank officers correctly in leaderboard by lifetime patrol time', () => {
    const off1 = addOfficer('Officer_First');
    const off2 = addOfficer('Officer_Second');
    const off3 = addOfficer('Officer_Third');

    const base = new Date('2026-09-01T10:00:00.000Z');

    // First: 10 hours
    startSession(off1.id, base.toISOString());
    endSession(off1.id, 'DISCONNECTED', new Date(base.getTime() + 10 * 3600 * 1000).toISOString());

    // Second: 5 hours
    startSession(off2.id, base.toISOString());
    endSession(off2.id, 'DISCONNECTED', new Date(base.getTime() + 5 * 3600 * 1000).toISOString());

    // Third: 2 hours
    startSession(off3.id, base.toISOString());
    endSession(off3.id, 'DISCONNECTED', new Date(base.getTime() + 2 * 3600 * 1000).toISOString());

    const embed = buildLeaderboardEmbed();
    const desc = embed.data.description || '';

    // First should have 🥇 and Officer_First
    expect(desc).toContain('🥇 **Officer_First** — 10h');
    expect(desc).toContain('🥈 **Officer_Second** — 5h');
    expect(desc).toContain('🥉 **Officer_Third** — 2h');
  });

  it('should generate period breakdown embeds without errors', () => {
    addOfficer('Officer_A');
    addOfficer('Officer_B');

    const todayEmbed = buildPeriodEmbed('today');
    expect(todayEmbed.data.title).toContain('TODAY’S PD PATROL STATS');

    const weeklyEmbed = buildPeriodEmbed('weekly');
    expect(weeklyEmbed.data.title).toContain('THIS WEEK’S PD PATROL STATS');

    const monthlyEmbed = buildPeriodEmbed('monthly');
    expect(monthlyEmbed.data.title).toContain('THIS MONTH’S PD PATROL STATS');
  });
});
