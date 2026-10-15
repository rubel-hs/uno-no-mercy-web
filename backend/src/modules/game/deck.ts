import type { CardColor, CardFace, CardKind, PhysicalCard } from "./game.types";

const COLORS: readonly CardColor[] = ["red", "yellow", "green", "blue"];

const cardFaces: CardFace[] = [
  ...COLORS.flatMap((color) =>
    Array.from({ length: 10 }, (_, value) => ({
      faceId: `${color}-${value}`,
      color,
      kind: "number" as const,
      value,
    })),
  ),
  ...COLORS.flatMap((color) => [
    { faceId: `${color}-skip`, color, kind: "skip" as const },
    { faceId: `${color}-reverse`, color, kind: "reverse" as const },
    { faceId: `${color}-draw-2`, color, kind: "draw-2" as const, drawValue: 2 },
    { faceId: `${color}-discard-all`, color, kind: "discard-all" as const },
    { faceId: `${color}-draw-4`, color, kind: "draw-4" as const, drawValue: 4 },
    { faceId: `${color}-skip-everyone`, color, kind: "skip-everyone" as const },
  ]),
  { faceId: "wild-reverse-draw-4", color: "wild", kind: "wild-reverse-draw-4", drawValue: 4 },
  { faceId: "wild-color-roulette", color: "wild", kind: "wild-color-roulette" },
  { faceId: "wild-draw-6", color: "wild", kind: "draw-6", drawValue: 6 },
  { faceId: "wild-draw-10", color: "wild", kind: "draw-10", drawValue: 10 },
];

export const CARD_FACES: readonly CardFace[] = Object.freeze(
  cardFaces.map((face) => Object.freeze(face)),
);

const MULTIPLICITIES: Readonly<Record<CardKind, number>> = Object.freeze({
  number: 2,
  skip: 3,
  reverse: 3,
  "draw-2": 3,
  "discard-all": 3,
  "draw-4": 2,
  "skip-everyone": 2,
  "wild-reverse-draw-4": 8,
  "wild-color-roulette": 8,
  "draw-6": 4,
  "draw-10": 4,
});

export function createDeck(idFactory: () => string): PhysicalCard[] {
  return CARD_FACES.flatMap((face) =>
    Array.from({ length: MULTIPLICITIES[face.kind] }, () => ({
      instanceId: idFactory(),
      faceId: face.faceId,
    })),
  );
}

export function shuffleDeck(
  cards: readonly PhysicalCard[],
  random: () => number = Math.random,
): PhysicalCard[] {
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = shuffled[index]!;
    shuffled[index] = shuffled[swapIndex]!;
    shuffled[swapIndex] = current;
  }

  return shuffled;
}
