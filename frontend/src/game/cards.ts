export const CARD_COLORS = ["red", "yellow", "green", "blue"] as const;

export type CardColor = (typeof CARD_COLORS)[number] | "wild";
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
  | "draw-10"
  | "back";

export type CardDefinition = {
  id: string;
  label: string;
  family: string;
  color: CardColor;
  kind: CardKind;
  value: string;
  assetFile: string;
};

const createCard = (
  id: string,
  label: string,
  family: string,
  color: CardColor,
  kind: CardKind,
  value: string,
): CardDefinition => ({
  id,
  label,
  family,
  color,
  kind,
  value,
  assetFile: `${id}.webp`,
});

const coloredCards = (
  family: string,
  kind: CardKind,
  value: string,
): CardDefinition[] =>
  CARD_COLORS.map((color) =>
    createCard(
      `${color}-${kind}`,
      `${color} ${family}`,
      family,
      color,
      kind,
      value,
    ),
  );

export const numberCards: CardDefinition[] = CARD_COLORS.flatMap((color) =>
  Array.from({ length: 10 }, (_, number) =>
    createCard(
      `${color}-${number}`,
      `${color} ${number}`,
      "Number",
      color,
      "number",
      String(number),
    ),
  ),
);

export const actionCards: CardDefinition[] = [
  ...coloredCards("Skip", "skip", "⊘"),
  ...coloredCards("Reverse", "reverse", "↻"),
  ...coloredCards("Draw 2", "draw-2", "+2"),
  ...coloredCards("Discard All", "discard-all", "DISCARD\nALL"),
  ...coloredCards("Draw 4", "draw-4", "+4"),
  ...coloredCards("Skip Everyone", "skip-everyone", "SKIP\nALL"),
];

export const wildCards: CardDefinition[] = [
  createCard(
    "wild-draw-6",
    "Wild Draw 6",
    "Wild Draw 6",
    "wild",
    "draw-6",
    "+6",
  ),
  createCard(
    "wild-draw-10",
    "Wild Draw 10",
    "Wild Draw 10",
    "wild",
    "draw-10",
    "+10",
  ),
  createCard(
    "wild-reverse-draw-4",
    "Wild Reverse Draw 4",
    "Wild Reverse Draw 4",
    "wild",
    "wild-reverse-draw-4",
    "↻\n+4",
  ),
  createCard(
    "wild-color-roulette",
    "Wild Color Roulette",
    "Wild Color Roulette",
    "wild",
    "wild-color-roulette",
    "ROULETTE",
  ),
];

export const cardCatalog = [...numberCards, ...actionCards, ...wildCards];

export const cardBack = createCard(
  "card-back",
  "UNO No Mercy card back",
  "Card back",
  "wild",
  "back",
  "UNO",
);

export const findCard = (id: string): CardDefinition => {
  const normalizedId = id.replace(/-draw-two$/, "-draw-2");
  const card = cardCatalog.find((candidate) => candidate.id === normalizedId);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
};
