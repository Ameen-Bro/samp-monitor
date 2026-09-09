import { querySampServer } from '../samp/query';
import { SampServerStatus, ServerPlayer } from '../samp/types';
import { getActiveOfficers, Officer } from '../database/officers';
import { startSession, endSession, getActiveSession } from '../database/sessions';
import { logQueryResult } from '../database/queryLogs';
import { getServerConfig } from '../database/settings';
import { normalizeName } from '../utils/normalizeName';
import { logger } from '../utils/logger';
import { nowUtc } from '../utils/time';
import { reconcileOnRestart } from './recovery';
import { config } from '../config';

export type DashboardUpdateCallback = (status: SampServerStatus) => Promise<void>;

export class SampTracker {
  private ip: string | null = null;
  private port: number | null = null;
  private intervalSeconds: number;
  private missedThreshold: number;

  private checkTimer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;
  private consecutiveFailures: number = 0;
  private lastStatus: SampServerStatus | null = null;
  private isInitialCheck: boolean = true;

  private onUpdateCallbacks: DashboardUpdateCallback[] = [];

  constructor(
    ip?: string | null,
    port?: number | null,
    intervalSeconds: number = config.queryIntervalSeconds,
    missedThreshold: number = config.missedQueryThreshold
  ) {
    this.intervalSeconds = intervalSeconds;
    this.missedThreshold = missedThreshold;
    if (ip && port) {
      this.ip = ip;
      this.port = port;
    } else {
      this.loadServerFromDb();
    }
  }

  /**
   * Reloads server IP/port from the settings database.
   */
  public loadServerFromDb(): boolean {
    const serverConfig = getServerConfig();
    if (serverConfig.ip && serverConfig.port && serverConfig.monitoringEnabled) {
      this.ip = serverConfig.ip;
      this.port = serverConfig.port;
      if (serverConfig.queryInterval > 0) {
        this.intervalSeconds = serverConfig.queryInterval;
      }
      logger.info('Tracker', `Server loaded from DB: ${this.ip}:${this.port}`);
      return true;
    }
    this.ip = null;
    this.port = null;
    return false;
  }

  /**
   * Updates the server at runtime (e.g., after admin sets a new server via /server-config).
   */
  public updateServer(ip: string, port: number, intervalSeconds?: number): void {
    const wasRunning = !!this.checkTimer;
    this.stopAutoCheck();
    this.ip = ip;
    this.port = port;
    if (intervalSeconds) this.intervalSeconds = intervalSeconds;
    this.isInitialCheck = true;
    this.consecutiveFailures = 0;
    this.lastStatus = null;
    if (wasRunning) {
      this.startAutoCheck();
    }
    logger.info('Tracker', `Server updated to ${ip}:${port}`);
  }

  /**
   * Clears the server config (monitoring disabled).
   */
  public clearServer(): void {
    this.stopAutoCheck();
    this.ip = null;
    this.port = null;
    this.lastStatus = null;
    logger.info('Tracker', 'Server config cleared. Monitoring disabled.');
  }

  public isServerConfigured(): boolean {
    return this.ip !== null && this.port !== null;
  }

  public registerUpdateCallback(cb: DashboardUpdateCallback): void {
    this.onUpdateCallbacks.push(cb);
  }

  public getLastStatus(): SampServerStatus | null {
    return this.lastStatus;
  }

  public getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  public getCurrentServer(): { ip: string | null; port: number | null } {
    return { ip: this.ip, port: this.port };
  }

  /**
   * Executes a server check, reconciles officer sessions, and triggers updates.
   */
  public async checkNow(): Promise<SampServerStatus> {
    if (!this.ip || !this.port) {
      const unconfiguredStatus: SampServerStatus = {
        online: false,
        ip: 'not-configured',
        port: 0,
        latencyMs: -1,
        players: [],
        lastQueriedAt: new Date(),
        error: 'No server configured. Use /server-config to set a server.',
      };
      for (const cb of this.onUpdateCallbacks) {
        try { await cb(unconfiguredStatus); } catch { /* ignore */ }
      }
      return unconfiguredStatus;
    }

    if (this.isChecking) {
      logger.warn('Tracker', 'Check already in progress, skipping concurrent trigger.');
      return this.lastStatus || {
        online: false,
        ip: this.ip,
        port: this.port,
        latencyMs: -1,
        players: [],
        lastQueriedAt: new Date(),
        error: 'Query already in progress',
      };
    }

    this.isChecking = true;
    try {
      const status = await querySampServer(this.ip, this.port, { timeoutMs: 3500 });
      this.lastStatus = status;

      if (status.online) {
        logQueryResult(true, status.info?.players ?? 0, status.latencyMs);
        this.handleSuccessfulQuery(status);
      } else {
        logQueryResult(false, 0, -1, status.error);
        this.handleFailedQuery(status);
      }

      for (const cb of this.onUpdateCallbacks) {
        try {
          await cb(status);
        } catch (err) {
          logger.error('Tracker', 'Error in dashboard update callback', err);
        }
      }

      return status;
    } finally {
      this.isChecking = false;
    }
  }

  private handleSuccessfulQuery(status: SampServerStatus): void {
    this.consecutiveFailures = 0;

    if (this.isInitialCheck) {
      reconcileOnRestart(status.players);
      this.isInitialCheck = false;
      return;
    }

    const activeOfficers = getActiveOfficers();
    const onlineNameMap = new Map<string, ServerPlayer>();
    for (const p of status.players) {
      onlineNameMap.set(normalizeName(p.name), p);
    }

    const now = nowUtc();

    for (const officer of activeOfficers) {
      const isOnline = onlineNameMap.has(officer.normalized_name);
      const activeSession = getActiveSession(officer.id);

      if (isOnline && !activeSession) {
        logger.info('Tracker', `${officer.ig_name} detected ONLINE. Starting session.`);
        startSession(officer.id, now);
      } else if (!isOnline && activeSession) {
        logger.info('Tracker', `${officer.ig_name} detected OFFLINE. Ending session.`);
        endSession(officer.id, 'DISCONNECTED', now);
      }
    }
  }

  private handleFailedQuery(status: SampServerStatus): void {
    this.consecutiveFailures++;
    logger.warn(
      'Tracker',
      `Server query failed (${this.consecutiveFailures}/${this.missedThreshold}): ${status.error || 'Timeout'}`
    );

    if (this.consecutiveFailures >= this.missedThreshold) {
      logger.error('Tracker', `Missed query threshold reached (${this.consecutiveFailures}). Ending active sessions.`);
      const activeOfficers = getActiveOfficers();
      const now = nowUtc();

      for (const officer of activeOfficers) {
        const activeSession = getActiveSession(officer.id);
        if (activeSession) {
          endSession(officer.id, 'SERVER_UNREACHABLE', now);
        }
      }
    } else {
      logger.info('Tracker', 'Missed query threshold not reached; maintaining current officer session states.');
    }
  }

  /**
   * Starts the periodic automatic background check.
   * Only starts if a server is configured.
   */
  public startAutoCheck(): void {
    if (!this.isServerConfigured()) {
      logger.warn('Tracker', 'No server configured — auto-check not started. Use /server-config to configure a server.');
      return;
    }

    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    logger.info(
      'Tracker',
      `Starting automated check every ${this.intervalSeconds}s (Missed Threshold: ${this.missedThreshold})`
    );

    // Immediate initial check
    this.checkNow().catch((err) => {
      logger.error('Tracker', 'Initial check error', err);
    });

    this.checkTimer = setInterval(() => {
      this.checkNow().catch((err) => {
        logger.error('Tracker', 'Periodic check error', err);
      });
    }, this.intervalSeconds * 1000);
  }

  public stopAutoCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
      logger.info('Tracker', 'Automated check stopped.');
    }
  }
}

export const tracker = new SampTracker();
