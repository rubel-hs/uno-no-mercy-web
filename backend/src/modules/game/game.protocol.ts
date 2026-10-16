import type { CardColor, GameCommand, GameErrorCode, GameState, PhysicalCard } from "./game.types";

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "INVALID_MESSAGE" };

type WithoutActor<T> = T extends { playerId: string } ? Omit<T, "playerId"> : never;

export type ClientCommand =
  | { type: "start-game" }
  | { type: "start-next-round" }
  | { type: "leave-room" }
  | WithoutActor<GameCommand>;

export type MatchStatus = "lobby" | "round-active" | "round-complete" | "match-complete";

export interface PlayerScore {
  playerId: string;
  points: number;
}

export interface RoundScoreBreakdown {
  playerId: string;
  cardPoints: number;
  eliminationBonus: number;
  roundPoints: number;
  cumulativePoints: number;
}

export interface RoundResult {
  roundNumber: number;
  winnerId: string;
  breakdown: RoundScoreBreakdown[];
  matchWinnerId: string | null;
}

export interface ClientEnvelope {
  version: 1;
  type: "command";
  commandId: string;
  revision: number;
  command: ClientCommand;
}

/** Auth is the gateway's separate first message, never a room/game command. */
export interface AuthenticateMessage {
  version: 1;
  type: "authenticate";
  token: string;
}

export type CommandErrorCode =
  | GameErrorCode
  | "INVALID_MESSAGE"
  | "ROOM_NOT_FOUND"
  | "ROOM_CLOSED"
  | "ROOM_FULL"
  | "ROOM_STARTED"
  | "INVALID_NAME"
  | "DUPLICATE_NAME"
  | "INVALID_TOKEN"
  | "NOT_AUTHENTICATED"
  | "NOT_HOST"
  | "NOT_ENOUGH_PLAYERS"
  | "round-not-complete"
  | "match-complete"
  | "PLAYER_NOT_FOUND"
  | "STALE_REVISION"
  | "DUPLICATE_COMMAND"
  | "INTERNAL_ERROR";

export interface PublicPlayer {
  id: string;
  name: string;
  order: number;
  cardCount: number;
  online: boolean;
  eliminated: boolean;
}

export interface PlayerSnapshot {
  /** Added by the room store for both lobby and game broadcasts. */
  roomCode?: string;
  hostPlayerId?: string;
  viewerId: string;
  revision: number;
  phase: GameState["phase"] | "lobby";
  players: PublicPlayer[];
  hand: PhysicalCard[];
  drawCount: number;
  topDiscard: { faceId: string } | null;
  currentPlayerId: string | null;
  direction: 1 | -1;
  activeColor: CardColor | null;
  pendingChoice: {
    type: "choose-color" | "choose-swap-target" | "choose-roulette-color";
    playerId: string;
  } | null;
  drawStack: { amount: number; minimumDrawValue: number } | null;
  unoWindow: { playerId: string; declared: boolean } | null;
  winner: string | null;
  legalCardIds: string[];
  allowedControls: ClientCommand["type"][];
  /** Public match data; optional while older room snapshots are projected without a match. */
  matchStatus?: MatchStatus;
  roundNumber?: number;
  targetScore?: 1000;
  scores?: PlayerScore[];
  roundResult?: RoundResult | null;
  matchWinner?: string | null;
}

export type ServerMessage =
  | { version: 1; type: "snapshot"; snapshot: PlayerSnapshot }
  | { version: 1; type: "rejection"; commandId?: string; code: CommandErrorCode; message: string; revision?: number }
  | { version: 1; type: "lifecycle"; event: "player-connected" | "player-disconnected" | "player-eliminated" | "room-closed"; playerId?: string };

function captureRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object") return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const captured: Record<string, unknown> = Object.create(null);
  // Capture each own data descriptor once. Never read a caller-owned property again:
  // a proxy's get trap could return a different value after it has been validated.
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value")) return null;
    captured[key] = descriptor.value;
  }
  return captured;
}

function hasKeys(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  return required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => required.includes(key) || optional.includes(key));
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isColor(value: unknown): value is CardColor {
  return value === "red" || value === "yellow" || value === "green" || value === "blue";
}

function parseCommand(input: unknown): ClientCommand | null {
  const value = captureRecord(input);
  if (!value) return null;
  switch (value.type) {
    case "start-game":
    case "start-next-round":
    case "leave-room":
    case "draw-until-playable":
    case "draw-and-pass":
    case "accept-draw":
    case "declare-uno":
      return hasKeys(value, ["type"]) ? { type: value.type } : null;
    case "play-card": {
      if (!hasKeys(value, ["type", "cardId"], ["declareUno"]) || !isIdentifier(value.cardId)) return null;
      if (Object.hasOwn(value, "declareUno")) {
        if (typeof value.declareUno !== "boolean") return null;
        return { type: value.type, cardId: value.cardId, declareUno: value.declareUno };
      }
      return { type: value.type, cardId: value.cardId };
    }
    case "choose-color":
    case "choose-roulette-color":
      return hasKeys(value, ["type", "color"]) && isColor(value.color) ? { type: value.type, color: value.color } : null;
    case "choose-swap-target":
    case "catch-uno":
      return hasKeys(value, ["type", "targetPlayerId"]) && isIdentifier(value.targetPlayerId)
        ? { type: value.type, targetPlayerId: value.targetPlayerId } : null;
    default:
      return null;
  }
}

/** Validates decoded JSON. Text, byte limits and first-message authentication belong to the gateway. */
export function parseClientMessage(input: unknown): ParseResult<ClientEnvelope> {
  const invalid = { ok: false, code: "INVALID_MESSAGE" } as const;
  try {
    const value = captureRecord(input);
    if (!value || !hasKeys(value, ["version", "type", "commandId", "revision", "command"]) ||
      value.version !== 1 || value.type !== "command" || !isIdentifier(value.commandId) || value.commandId.length > 64 ||
      typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0) return invalid;
    const command = parseCommand(value.command);
    if (!command) return invalid;
    // Return only newly constructed data so validation cannot be invalidated by caller mutation.
    return { ok: true, value: { version: 1, type: "command", commandId: value.commandId, revision: value.revision, command } };
  } catch {
    return invalid;
  }
}
