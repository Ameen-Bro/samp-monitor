import { getActiveOfficers } from '../database/officers';
import { getAllActiveSessions, startSession, endSession } from '../database/sessions';
import { ServerPlayer } from '../samp/types';
import { normalizeName } from '../utils/normalizeName';
import { logger } from '../utils/logger';
import { nowUtc } from '../utils/time';

/**
 * Reconciles database sessions on bot restart with the live server player list.
 * - If an officer has an open session and is still online: continues the session seamlessly.
 * - If an officer has an open session but is no longer online: cleanly closes the session.
 * - If an officer is online but has no open session: starts a new session.
 */
export function reconcileOnRestart(onlinePlayers: ServerPlayer[]): void {
  logger.info('Recovery', 'Reconciling active sessions on startup...');
  const activeOfficers = getActiveOfficers();
  const openSessions = getAllActiveSessions();
  const now = nowUtc();

  // Map of online normalized names
  const onlineSet = new Set(onlinePlayers.map((p) => normalizeName(p.name)));
  const openSessionOfficerIds = new Set(openSessions.map((s) => s.officer_id));

  for (const officer of activeOfficers) {
    const isOnlineNow = onlineSet.has(officer.normalized_name);
    const hasOpenSession = openSessionOfficerIds.has(officer.id);

    if (isOnlineNow && hasOpenSession) {
      logger.info('Recovery', `Officer ${officer.ig_name} was online before restart and is still online. Continuing session.`);
    } else if (!isOnlineNow && hasOpenSession) {
      logger.info('Recovery', `Officer ${officer.ig_name} was online before restart but is no longer detected. Closing session.`);
      endSession(officer.id, 'OFFLINE_AT_RESTART', now);
    } else if (isOnlineNow && !hasOpenSession) {
      logger.info('Recovery', `Officer ${officer.ig_name} is online now. Starting session.`);
      startSession(officer.id, now);
    }
  }

  logger.info('Recovery', 'Startup session reconciliation completed.');
}
