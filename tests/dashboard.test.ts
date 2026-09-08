import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDatabase, closeDatabase } from '../src/database/db';
import { addOfficer } from '../src/database/officers';
import { buildDashboard } from '../src/discord/dashboard';
import { SampServerStatus } from '../src/samp/types';

describe('Dashboard Layout, Online-First Sorting & Pagination', () => {
  beforeEach(() => {
    closeDatabase();
    initDatabase(':memory:');
  });

  afterEach(() => {
    closeDatabase();
  });

  it('should display online officers before offline officers', () => {
    addOfficer('Offline_Bob');
    addOfficer('Online_Alice');

    const mockStatus: SampServerStatus = {
      online: true,
      ip: '127.0.0.1',
      port: 7777,
      latencyMs: 40,
      info: { password: false, players: 1, maxPlayers: 100, hostname: 'Server', gamemode: 'RP', mapname: 'SA' },
      players: [{ id: 0, name: 'Online_Alice', score: 10, ping: 30 }],
      lastQueriedAt: new Date(),
    };

    const dashboard = buildDashboard(mockStatus, 1);
    const desc = dashboard.embeds[0].data.description || '';

    const aliceIndex = desc.indexOf('Online_Alice');
    const bobIndex = desc.indexOf('Offline_Bob');

    expect(aliceIndex).toBeGreaterThan(-1);
    expect(bobIndex).toBeGreaterThan(-1);
    // Alice (online) must appear before Bob (offline)
    expect(aliceIndex).toBeLessThan(bobIndex);
  });

  it('should create pagination rows when registered officers exceed limit per page', () => {
    // Add 25 officers
    for (let i = 1; i <= 25; i++) {
      addOfficer(`Officer_${String(i).padStart(2, '0')}`);
    }

    const mockStatus: SampServerStatus = {
      online: true,
      ip: '127.0.0.1',
      port: 7777,
      latencyMs: 35,
      info: { password: false, players: 0, maxPlayers: 100, hostname: 'Server', gamemode: 'RP', mapname: 'SA' },
      players: [],
      lastQueriedAt: new Date(),
    };

    // Page 1
    const page1 = buildDashboard(mockStatus, 1);
    expect(page1.embeds[0].data.description).toContain('Page 1 / 3');
    // Navigation row should be present
    expect(page1.components.length).toBe(2);

    // Page 2
    const page2 = buildDashboard(mockStatus, 2);
    expect(page2.embeds[0].data.description).toContain('Page 2 / 3');

    // Page 3
    const page3 = buildDashboard(mockStatus, 3);
    expect(page3.embeds[0].data.description).toContain('Page 3 / 3');
  });

  it('should show placeholder message if no officers are registered', () => {
    const dashboard = buildDashboard(null, 1);
    expect(dashboard.embeds[0].data.description).toContain('No officers registered yet');
  });
});
