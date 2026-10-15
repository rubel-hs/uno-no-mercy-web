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
