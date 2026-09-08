import { describe, it, expect } from 'vitest';
import {
  buildSampPacket,
  validateHeader,
  parseInfoPacket,
  parseDetailedPlayersPacket,
  parseClientPlayersPacket,
} from '../src/samp/parser';

describe('SA-MP Packet Builder & Parser', () => {
  it('should build a valid 11-byte header', () => {
    const packet = buildSampPacket('139.99.52.211', 7777, 'i');
    expect(packet.length).toBe(11);
    expect(packet.subarray(0, 4).toString('ascii')).toBe('SAMP');
    expect(packet[4]).toBe(139);
    expect(packet[5]).toBe(99);
    expect(packet[6]).toBe(52);
    expect(packet[7]).toBe(211);
    expect(packet.readUInt16LE(8)).toBe(7777);
    expect(String.fromCharCode(packet[10])).toBe('i');
  });

  it('should validate headers correctly', () => {
    const validPacket = buildSampPacket('127.0.0.1', 7777, 'i');
    expect(validateHeader(validPacket, 'i')).toBe(true);
    expect(validateHeader(validPacket, 'd')).toBe(false);

    const corrupt = Buffer.from('NOT_SAMP_HEADER');
    expect(validateHeader(corrupt, 'i')).toBe(false);
  });

  it('should parse mock Info packet correctly', () => {
    // Construct mock 'i' packet
    const header = buildSampPacket('127.0.0.1', 7777, 'i');
    const hostname = Buffer.from('Test Server');
    const gamemode = Buffer.from('Roleplay');
    const mapname = Buffer.from('San Andreas');

    const payload = Buffer.alloc(1 + 2 + 2 + 4 + hostname.length + 4 + gamemode.length + 4 + mapname.length);
    let offset = 0;
    payload.writeUInt8(0, offset); // password = false
    offset += 1;
    payload.writeUInt16LE(15, offset); // players = 15
    offset += 2;
    payload.writeUInt16LE(100, offset); // maxPlayers = 100
    offset += 2;

    payload.writeUInt32LE(hostname.length, offset);
    offset += 4;
    hostname.copy(payload, offset);
    offset += hostname.length;

    payload.writeUInt32LE(gamemode.length, offset);
    offset += 4;
    gamemode.copy(payload, offset);
    offset += gamemode.length;

    payload.writeUInt32LE(mapname.length, offset);
    offset += 4;
    mapname.copy(payload, offset);

    const fullBuffer = Buffer.concat([header, payload]);
    const info = parseInfoPacket(fullBuffer);

    expect(info.password).toBe(false);
    expect(info.players).toBe(15);
    expect(info.maxPlayers).toBe(100);
    expect(info.hostname).toBe('Test Server');
    expect(info.gamemode).toBe('Roleplay');
    expect(info.mapname).toBe('San Andreas');
  });

  it('should parse mock Detailed Players packet correctly', () => {
    const header = buildSampPacket('127.0.0.1', 7777, 'd');
    const p1Name = Buffer.from('John_Smith');
    const p2Name = Buffer.from('Alex_PD');

    const payload = Buffer.alloc(
      2 +
      (1 + 1 + p1Name.length + 4 + 4) +
      (1 + 1 + p2Name.length + 4 + 4)
    );

    let offset = 0;
    payload.writeUInt16LE(2, offset); // 2 players
    offset += 2;

    // Player 1
    payload.writeUInt8(0, offset); // ID 0
    offset += 1;
    payload.writeUInt8(p1Name.length, offset);
    offset += 1;
    p1Name.copy(payload, offset);
    offset += p1Name.length;
    payload.writeInt32LE(42, offset); // score
    offset += 4;
    payload.writeUInt32LE(35, offset); // ping
    offset += 4;

    // Player 2
    payload.writeUInt8(1, offset); // ID 1
    offset += 1;
    payload.writeUInt8(p2Name.length, offset);
    offset += 1;
    p2Name.copy(payload, offset);
    offset += p2Name.length;
    payload.writeInt32LE(10, offset); // score
    offset += 4;
    payload.writeUInt32LE(50, offset); // ping

    const fullBuffer = Buffer.concat([header, payload]);
    const players = parseDetailedPlayersPacket(fullBuffer);

    expect(players.length).toBe(2);
    expect(players[0]).toEqual({ id: 0, name: 'John_Smith', score: 42, ping: 35 });
    expect(players[1]).toEqual({ id: 1, name: 'Alex_PD', score: 10, ping: 50 });
  });

  it('should parse mock Client Players packet fallback', () => {
    const header = buildSampPacket('127.0.0.1', 7777, 'c');
    const name = Buffer.from('Fallback_User');
    const payload = Buffer.alloc(2 + 1 + name.length + 4);

    let offset = 0;
    payload.writeUInt16LE(1, offset);
    offset += 2;
    payload.writeUInt8(name.length, offset);
    offset += 1;
    name.copy(payload, offset);
    offset += name.length;
    payload.writeInt32LE(99, offset);

    const fullBuffer = Buffer.concat([header, payload]);
    const players = parseClientPlayersPacket(fullBuffer);

    expect(players.length).toBe(1);
    expect(players[0].name).toBe('Fallback_User');
    expect(players[0].score).toBe(99);
  });
});
