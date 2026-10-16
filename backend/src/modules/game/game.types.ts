export type CardColor = "red" | "yellow" | "green" | "blue";

export type CardKind =
  | "number"
  | "skip"
  | "reverse"
  | "draw-2"
  | "draw-4"
  | "discard-all"
  | "skip-everyone"
  | "wild-reverse-draw-4"
  | "wild-color-roulette"
  | "draw-6"
  | "draw-10";

export interface CardFace {
  readonly faceId: string;
  readonly color: CardColor | "wild";
  readonly kind: CardKind;
  readonly value?: number;
  readonly drawValue?: number;
}

export interface PhysicalCard {
  instanceId: string;
  faceId: string;
}

export interface CreateGameInput {
  playerIds: string[];
  /** Ordered from the next card dealt/drawn to the last. */
  deck: PhysicalCard[];
  dealerIndex: number;
}

export interface GamePlayer {
  id: string;
  /** Room-owned presentation metadata; engine-only callers may omit it. */
  name?: string;
  /** Connection state is supplied by the room, never used for turn eligibility. */
  online?: boolean;
  hand: PhysicalCard[];
  eliminated: boolean;
  eliminatedByPlayerId: string | null;
}

export type PendingChoice =
  | { type: "resolve-action"; playerId: string; cardId: string }
  | { type: "choose-color"; playerId: string }
  | { type: "choose-swap-target"; playerId: string }
  | { type: "choose-roulette-color"; playerId: string };

export interface DrawStack {
  amount: number;
  minimumDrawValue: number;
}

export interface UnoWindow {
  playerId: string;
  declared: boolean;
  expiresAtGameplaySequence: number;
}

export interface GameState {
  players: GamePlayer[];
  drawPile: PhysicalCard[];
  /** Oldest discard first; the final card is visible. */
  discardPile: PhysicalCard[];
  direction: 1 | -1;
  currentPlayerId: string;
  activeColor: CardColor;
  phase: "playing" | "pending-effect" | "awaiting-choice" | "finished";
  pendingChoice: PendingChoice | null;
  drawStack: DrawStack | null;
  unoWindow: UnoWindow | null;
  winner: string | null;
  revision: number;
  /** Accepted turn-start actions, including the affected player's roulette choice. */
  gameplaySequence: number;
}

export type GameCommand =
  | { type: "play-card"; playerId: string; cardId: string; declareUno?: boolean }
  | { type: "draw-until-playable"; playerId: string }
  | { type: "draw-and-pass"; playerId: string }
  | { type: "accept-draw"; playerId: string }
  | { type: "choose-color"; playerId: string; color: CardColor }
  | { type: "choose-swap-target"; playerId: string; targetPlayerId: string }
  | { type: "choose-roulette-color"; playerId: string; color: CardColor }
  | { type: "declare-uno"; playerId: string }
  | { type: "catch-uno"; playerId: string; targetPlayerId: string };

export type GameErrorCode =
  | "out-of-turn"
  | "card-not-in-hand"
  | "illegal-play"
  | "playable-card-in-hand"
  | "deck-exhausted"
  | "invalid-phase"
  | "invalid-target"
  | "uno-unavailable"
  | "unsupported-command";

export type GameEvent =
  | { type: "card-played"; playerId: string; cardId: string }
  | { type: "cards-drawn"; playerId: string; cardIds: string[] }
  | { type: "turn-changed"; playerId: string };

export type GameTransition =
  | { ok: false; code: GameErrorCode; state: GameState }
  | { ok: true; state: GameState; events: GameEvent[] };
