export interface ServerInfo {
  password: boolean;
  players: number;
  maxPlayers: number;
  hostname: string;
  gamemode: string;
  mapname: string;
}

export interface ServerPlayer {
  id: number;
  name: string;
  score: number;
  ping: number;
}

export interface ServerRule {
  name: string;
  value: string;
}

export interface SampServerStatus {
  online: boolean;
  ip: string;
  port: number;
  latencyMs: number;
  info?: ServerInfo;
  players: ServerPlayer[];
  rules?: Record<string, string>;
  lastQueriedAt: Date;
  error?: string;
}

export interface QueryOptions {
  timeoutMs?: number;
  retries?: number;
}
