import dgram from 'dgram';
import {
  buildSampPacket,
  parseInfoPacket,
  parseDetailedPlayersPacket,
  parseClientPlayersPacket,
  parseRulesPacket,
} from './parser';
import { SampServerStatus, QueryOptions, ServerPlayer, ServerInfo } from './types';

/**
 * Sends a single UDP packet to the SA-MP server and awaits the response.
 */
export function sendQueryPacket(
  ip: string,
  port: number,
  opcode: string,
  timeoutMs: number = 2500,
  extraPayload?: Buffer
): Promise<{ buffer: Buffer; latencyMs: number }> {
  return new Promise((resolve, reject) => {
    let socket: dgram.Socket | null = null;
    let timer: NodeJS.Timeout | null = null;
    let finished = false;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (socket) {
        try {
          socket.close();
        } catch {}
        socket = null;
      }
    };

    try {
      socket = dgram.createSocket('udp4');
      const startTime = Date.now();
      const packet = buildSampPacket(ip, port, opcode, extraPayload);

      timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          cleanup();
          reject(new Error(`UDP query timed out after ${timeoutMs}ms for opcode '${opcode}'`));
        }
      }, timeoutMs);

      socket.on('message', (msg) => {
        if (!finished) {
          finished = true;
          const latencyMs = Date.now() - startTime;
          cleanup();
          resolve({ buffer: msg, latencyMs });
        }
      });

      socket.on('error', (err) => {
        if (!finished) {
          finished = true;
          cleanup();
          reject(err);
        }
      });

      socket.send(packet, 0, packet.length, port, ip, (err) => {
        if (err && !finished) {
          finished = true;
          cleanup();
          reject(err);
        }
      });
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

/**
 * Performs a comprehensive SA-MP server query.
 * 1. Queries 'i' for ServerInfo and latency.
 * 2. Queries 'd' for Detailed Players.
 * 3. If 'd' yields 0 players while info.players > 0, queries 'c' as fallback.
 * 4. Optionally queries 'r' for rules if needed.
 */
export async function querySampServer(
  ip: string,
  port: number,
  options?: QueryOptions
): Promise<SampServerStatus> {
  const timeoutMs = options?.timeoutMs ?? 3000;
  const queriedAt = new Date();

  try {
    // 1. Query info ('i')
    const infoRes = await sendQueryPacket(ip, port, 'i', timeoutMs);
    const info: ServerInfo = parseInfoPacket(infoRes.buffer);
    const latencyMs = infoRes.latencyMs;

    let players: ServerPlayer[] = [];

    // If there are players online, query players
    if (info.players > 0) {
      try {
        // First try 'd' (detailed players: id, name, score, ping)
        const dRes = await sendQueryPacket(ip, port, 'd', timeoutMs);
        players = parseDetailedPlayersPacket(dRes.buffer);
      } catch {
        // Fallback to 'c' (clients: name, score)
        try {
          const cRes = await sendQueryPacket(ip, port, 'c', timeoutMs);
          players = parseClientPlayersPacket(cRes.buffer);
        } catch {
          // If player list query timed out but info succeeded, keep empty players list
          players = [];
        }
      }
    }

    return {
      online: true,
      ip,
      port,
      latencyMs,
      info,
      players,
      lastQueriedAt: queriedAt,
    };
  } catch (err: any) {
    return {
      online: false,
      ip,
      port,
      latencyMs: -1,
      players: [],
      lastQueriedAt: queriedAt,
      error: err?.message || String(err),
    };
  }
}
