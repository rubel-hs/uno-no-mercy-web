export type CardColor = "red" | "yellow" | "green" | "blue";

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

export interface PhysicalCard {
  instanceId: string;
  faceId: string;
}

export interface PublicPlayer {
  id: string;
  name: string;
  order: number;
  cardCount: number;
  online: boolean;
  eliminated: boolean;
}

export type ClientCommand =
  | { type: "start-game" }
  | { type: "start-next-round" }
  | { type: "leave-room" }
  | { type: "play-card"; cardId: string; declareUno?: boolean }
  | { type: "draw-until-playable" }
  | { type: "draw-and-pass" }
  | { type: "accept-draw" }
  | { type: "choose-color"; color: CardColor }
  | { type: "choose-swap-target"; targetPlayerId: string }
  | { type: "choose-roulette-color"; color: CardColor }
  | { type: "declare-uno" }
  | { type: "catch-uno"; targetPlayerId: string };

export interface ClientEnvelope {
  version: 1;
  type: "command";
  commandId: string;
  revision: number;
  command: ClientCommand;
}

export interface AuthenticateMessage {
  version: 1;
  type: "authenticate";
  token: string;
}

export type CommandErrorCode =
  | "out-of-turn"
  | "card-not-in-hand"
  | "illegal-play"
  | "playable-card-in-hand"
  | "deck-exhausted"
  | "invalid-phase"
  | "invalid-target"
  | "uno-unavailable"
  | "unsupported-command"
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

export interface PlayerSnapshot {
  roomCode?: string;
  hostPlayerId?: string;
  viewerId: string;
  revision: number;
  phase: "lobby" | "playing" | "finished";
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
  matchStatus?: MatchStatus;
  roundNumber?: number;
  targetScore?: 1000;
  scores?: PlayerScore[];
  roundResult?: RoundResult | null;
  matchWinner?: string | null;
}

export type ServerMessage =
  | { version: 1; type: "snapshot"; snapshot: PlayerSnapshot }
  | {
      version: 1;
      type: "rejection";
      commandId?: string;
      code: CommandErrorCode;
      message: string;
      revision?: number;
    }
  | {
      version: 1;
      type: "lifecycle";
      event:
        | "player-connected"
        | "player-disconnected"
        | "player-eliminated"
        | "room-closed";
      playerId?: string;
    };

export interface RoomCredentials {
  roomCode: string;
  playerId: string;
  token: string;
}
