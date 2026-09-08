import { config } from '../config';
import { querySampServer } from '../samp/query';
import { SampServerStatus, ServerPlayer } from '../samp/types';
import { getActiveOfficers, Officer } from '../database/officers';
import { startSession, endSession, getActiveSession } from '../database/sessions';
import { logQueryResult } from '../database/queryLogs';
import { normalizeName } from '../utils/normalizeName';
import { logger } from '../utils/logger';
import { nowUtc } from '../utils/time';
import { reconcileOnRestart } from './recovery';

export type DashboardUpdateCallback = (status: SampServerStatus) => Promise<void>;

export class SampTracker {
  private ip: string;
  private port: number;
  private intervalSeconds: number;
  private missedThreshold: number;

  private checkTimer: NodeJS.Timeout | null = null;
  private isChecking: boolean = false;
  private consecutiveFailures: number = 0;
  private lastStatus: SampServerStatus | null = null;
  private isInitialCheck: boolean = true;

  private onUpdateCallbacks: DashboardUpdateCallback[] = [];

  constructor(
    ip: string = config.sampServerIp,
    port: number = config.sampServerPort,
    intervalSeconds: number = config.queryIntervalSeconds,
    missedThreshold: number = config.missedQueryThreshold
  ) {
    this.ip = ip;
    this.port = port;
    this.intervalSeconds = intervalSeconds;
    this.missedThreshold = missedThreshold;
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

  /**
   * Executes a server check, reconciles officer sessions, and triggers updates.
   */
  public async checkNow(): Promise<SampServerStatus> {
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

      // Notify dashboard update callbacks
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
        logger.info('Tracker', `Officer ${officer.ig_name} detected ONLINE. Starting session.`);
        startSession(officer.id, now);
      } else if (!isOnline && activeSession) {
        logger.info('Tracker', `Officer ${officer.ig_name} detected OFFLINE. Ending session.`);
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

    // Only mark offline if failures reach the missed threshold
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
   */
  public startAutoCheck(): void {
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
