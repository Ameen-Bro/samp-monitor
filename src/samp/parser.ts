import { ServerInfo, ServerPlayer, ServerRule } from './types';

/**
 * Creates a raw SA-MP query packet buffer.
 * Structure:
 * - 4 bytes: 'SAMP' (0x53, 0x41, 0x4D, 0x50)
 * - 4 bytes: IP octets
 * - 2 bytes: Port in Little Endian uint16
 * - 1 byte:  Opcode ('i', 'd', 'c', 'r', 'p')
 * - optional extra payload (e.g. 4 bytes for ping)
 */
export function buildSampPacket(ip: string, port: number, opcode: string, extraPayload?: Buffer): Buffer {
  const ipParts = ip.split('.').map((p) => parseInt(p, 10));
  if (ipParts.length !== 4 || ipParts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    throw new Error(`Invalid IPv4 address: ${ip}`);
  }

  const headerLen = 11;
  const extraLen = extraPayload ? extraPayload.length : 0;
  const buf = Buffer.alloc(headerLen + extraLen);

  // 'SAMP'
  buf.write('SAMP', 0, 4, 'ascii');

  // 4 bytes IP
  buf[4] = ipParts[0];
  buf[5] = ipParts[1];
  buf[6] = ipParts[2];
  buf[7] = ipParts[3];

  // 2 bytes Port Little Endian
  buf.writeUInt16LE(port, 8);

  // 1 byte Opcode
  buf[10] = opcode.charCodeAt(0);

  if (extraPayload && extraLen > 0) {
    extraPayload.copy(buf, 11);
  }

  return buf;
}

/**
 * Safely decodes a string from a buffer slice with fallback to latin1.
 */
function safeDecodeString(buf: Buffer, start: number, end: number): string {
  if (start >= buf.length || end <= start) return '';
  const actualEnd = Math.min(end, buf.length);
  const slice = buf.subarray(start, actualEnd);
  try {
    const utf8 = slice.toString('utf8');
    // If UTF-8 contains replacement characters, try latin1
    if (utf8.includes('\uFFFD')) {
      return slice.toString('latin1').trim();
    }
    return utf8.trim();
  } catch {
    return slice.toString('latin1').trim();
  }
}

/**
 * Validates that the received buffer is a valid SA-MP response for the expected opcode.
 */
export function validateHeader(buf: Buffer, expectedOpcode: string): boolean {
  if (buf.length < 11) return false;
  const magic = buf.subarray(0, 4).toString('ascii');
  if (magic !== 'SAMP') return false;
  const opcode = String.fromCharCode(buf[10]);
  return opcode === expectedOpcode;
}

/**
 * Parses 'i' (Information) packet.
 */
export function parseInfoPacket(buf: Buffer): ServerInfo {
  if (!validateHeader(buf, 'i')) {
    throw new Error('Invalid SA-MP info packet header');
  }

  let offset = 11;
  if (buf.length < offset + 5) {
    throw new Error('Info packet truncated before player counts');
  }

  const password = buf.readUInt8(offset) === 1;
  offset += 1;

  const players = buf.readUInt16LE(offset);
  offset += 2;

  const maxPlayers = buf.readUInt16LE(offset);
  offset += 2;

  // Hostname
  if (offset + 4 > buf.length) throw new Error('Info packet truncated at hostname length');
  const hostLen = buf.readUInt32LE(offset);
  offset += 4;
  const hostname = safeDecodeString(buf, offset, offset + hostLen);
  offset += hostLen;

  // Gamemode
  if (offset + 4 > buf.length) throw new Error('Info packet truncated at gamemode length');
  const gmLen = buf.readUInt32LE(offset);
  offset += 4;
  const gamemode = safeDecodeString(buf, offset, offset + gmLen);
  offset += gmLen;

  // Mapname
  if (offset + 4 > buf.length) throw new Error('Info packet truncated at mapname length');
  const mapLen = buf.readUInt32LE(offset);
  offset += 4;
  const mapname = safeDecodeString(buf, offset, offset + mapLen);

  return {
    password,
    players,
    maxPlayers,
    hostname,
    gamemode,
    mapname,
  };
}

/**
 * Parses 'd' (Detailed players) packet.
 */
export function parseDetailedPlayersPacket(buf: Buffer): ServerPlayer[] {
  if (!validateHeader(buf, 'd')) {
    throw new Error('Invalid SA-MP detailed player packet header');
  }

  let offset = 11;
  if (buf.length < offset + 2) {
    return [];
  }

  const count = buf.readUInt16LE(offset);
  offset += 2;

  const players: ServerPlayer[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 2 > buf.length) break;

    const id = buf.readUInt8(offset);
    offset += 1;

    const nameLen = buf.readUInt8(offset);
    offset += 1;

    if (offset + nameLen > buf.length) break;
    const name = safeDecodeString(buf, offset, offset + nameLen);
    offset += nameLen;

    if (offset + 8 > buf.length) {
      players.push({ id, name, score: 0, ping: 0 });
      break;
    }

    const score = buf.readInt32LE(offset);
    offset += 4;

    const ping = buf.readUInt32LE(offset);
    offset += 4;

    players.push({ id, name, score, ping });
  }

  return players;
}

/**
 * Parses 'c' (Client list) packet as fallback.
 */
export function parseClientPlayersPacket(buf: Buffer): ServerPlayer[] {
  if (!validateHeader(buf, 'c')) {
    throw new Error('Invalid SA-MP client packet header');
  }

  let offset = 11;
  if (buf.length < offset + 2) {
    return [];
  }

  const count = buf.readUInt16LE(offset);
  offset += 2;

  const players: ServerPlayer[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 1 > buf.length) break;

    const nameLen = buf.readUInt8(offset);
    offset += 1;

    if (offset + nameLen > buf.length) break;
    const name = safeDecodeString(buf, offset, offset + nameLen);
    offset += nameLen;

    let score = 0;
    if (offset + 4 <= buf.length) {
      score = buf.readInt32LE(offset);
      offset += 4;
    }

    players.push({
      id: i,
      name,
      score,
      ping: 0,
    });
  }

  return players;
}

/**
 * Parses 'r' (Rules) packet.
 */
export function parseRulesPacket(buf: Buffer): Record<string, string> {
  if (!validateHeader(buf, 'r')) {
    throw new Error('Invalid SA-MP rules packet header');
  }

  let offset = 11;
  if (buf.length < offset + 2) {
    return {};
  }

  const count = buf.readUInt16LE(offset);
  offset += 2;

  const rules: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    if (offset + 1 > buf.length) break;
    const nameLen = buf.readUInt8(offset);
    offset += 1;

    if (offset + nameLen > buf.length) break;
    const ruleName = safeDecodeString(buf, offset, offset + nameLen);
    offset += nameLen;

    if (offset + 1 > buf.length) break;
    const valLen = buf.readUInt8(offset);
    offset += 1;

    if (offset + valLen > buf.length) break;
    const ruleVal = safeDecodeString(buf, offset, offset + valLen);
    offset += valLen;

    if (ruleName) {
      rules[ruleName] = ruleVal;
    }
  }

  return rules;
}
