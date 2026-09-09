import { getDb } from './db';
import { getNextTicketNumber } from './settings';
import { nowUtc } from '../utils/time';
import { logger } from '../utils/logger';

export interface Ticket {
  id: number;
  ticket_number: number;
  guild_id: string;
  channel_id: string;
  creator_id: string;
  creator_tag: string;
  category: string;
  subject: string | null;
  status: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
}

export function createTicket(
  guildId: string,
  channelId: string,
  creatorId: string,
  creatorTag: string,
  category: string,
  subject?: string
): Ticket {
  const db = getDb();
  const now = nowUtc(); // returns string already
  const ticketNumber = getNextTicketNumber();

  const result = db.prepare(`
    INSERT INTO tickets (ticket_number, guild_id, channel_id, creator_id, creator_tag, category, subject, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(ticketNumber, guildId, channelId, creatorId, creatorTag, category, subject ?? null, now);

  return {
    id: Number(result.lastInsertRowid),
    ticket_number: ticketNumber,
    guild_id: guildId,
    channel_id: channelId,
    creator_id: creatorId,
    creator_tag: creatorTag,
    category,
    subject: subject ?? null,
    status: 'open',
    created_at: now,
    closed_at: null,
    closed_by: null,
  };
}

export function getTicketByChannel(channelId: string): Ticket | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM tickets WHERE channel_id = ? AND status = 'open'").get(channelId) as unknown as Ticket | undefined;
  return row ?? null;
}

export function closeTicket(channelId: string, closedBy: string): boolean {
  const db = getDb();
  const now = nowUtc();
  const result = db.prepare(`
    UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = ? WHERE channel_id = ? AND status = 'open'
  `).run(now, closedBy, channelId);
  return Number(result.changes) > 0;
}

export function logTicketAction(ticketId: number, actorId: string, actorTag: string, action: string, note?: string): void {
  const db = getDb();
  const now = nowUtc();
  db.prepare(`
    INSERT INTO ticket_actions (ticket_id, actor_id, actor_tag, action, note, performed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ticketId, actorId, actorTag, action, note ?? null, now);
}

export function getOpenTicketsByUser(guildId: string, creatorId: string): Ticket[] {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM tickets WHERE guild_id = ? AND creator_id = ? AND status = 'open'"
  ).all(guildId, creatorId) as unknown as Ticket[];
}
