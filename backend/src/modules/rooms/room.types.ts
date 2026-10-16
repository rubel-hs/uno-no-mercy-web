import type { CommandErrorCode, ServerMessage } from "../game/game.protocol";
import type { GameState } from "../game/game.types";
import type { MatchStatus, RoundResult } from "../game/game.protocol";

export interface MatchState {
  status: MatchStatus;
  roundNumber: number;
  targetScore: 1000;
  scoresByPlayerId: Record<string, number>;
  lastRoundResult: RoundResult | null;
  winner: string | null;
  finalizedRoundNumber: number | null;
  dealerIndex: number;
}

export interface RoomPeer {
  id: string;
  send(message: ServerMessage): void;
  close(code?: number, reason?: string): void;
}

export interface RoomStoreDeps {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
  random(): number;
  roomCodeFactory(): string;
  tokenFactory(): string;
  cardIdFactory(): string;
}

export interface RoomCredentials {
  roomCode: string;
  playerId: string;
  token: string;
}

export type RoomResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: CommandErrorCode; message: string; revision?: number };

/** Detached diagnostics for tests; this is never sent to clients. */
export interface RoomInspection {
  roomCode: string;
  hostPlayerId: string;
  revision: number;
  players: { id: string; name: string; online: boolean; reconnectDeadline: number | null }[];
  game: GameState | null;
}

export interface RoomStore {
  createRoom(displayName: unknown): RoomResult<RoomCredentials>;
  joinRoom(roomCode: unknown, displayName: unknown): RoomResult<RoomCredentials>;
  connect(roomCode: unknown, token: unknown, peer: RoomPeer): RoomResult<{ playerId: string }>;
  disconnect(roomCode: string, playerId: string, peerId: string): void;
  /** playerId is the authenticated session identity, never a client payload field. */
  handleCommand(roomCode: string, playerId: string, envelope: unknown): RoomResult<{ revision: number }>;
  getRoom(roomCode: string): RoomInspection | null;
}
