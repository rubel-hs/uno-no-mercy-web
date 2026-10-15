import { describe, expect, test } from "bun:test";
import { CARD_FACES, createDeck, shuffleDeck } from "./deck";

describe("canonical No Mercy deck", () => {
  test("creates the canonical 168-card deck", () => {
    let nextId = 0;
    const deck = createDeck(() => `card-${nextId++}`);
    const multiplicities = new Map<string, number>();

    for (const card of deck) {
      multiplicities.set(card.faceId, (multiplicities.get(card.faceId) ?? 0) + 1);
    }

    expect(deck).toHaveLength(168);
    expect(CARD_FACES).toHaveLength(68);
    expect([...multiplicities.values()].reduce((total, count) => total + count, 0)).toBe(168);

    for (const color of ["red", "yellow", "green", "blue"] as const) {
      for (let value = 0; value <= 9; value++) {
        expect(multiplicities.get(`${color}-${value}`)).toBe(2);
      }

      expect(multiplicities.get(`${color}-skip`)).toBe(3);
      expect(multiplicities.get(`${color}-reverse`)).toBe(3);
      expect(multiplicities.get(`${color}-draw-2`)).toBe(3);
      expect(multiplicities.get(`${color}-discard-all`)).toBe(3);
      expect(multiplicities.get(`${color}-draw-4`)).toBe(2);
      expect(multiplicities.get(`${color}-skip-everyone`)).toBe(2);
    }

    expect(multiplicities.get("wild-reverse-draw-4")).toBe(8);
    expect(multiplicities.get("wild-color-roulette")).toBe(8);
    expect(multiplicities.get("wild-draw-6")).toBe(4);
    expect(multiplicities.get("wild-draw-10")).toBe(4);
  });

  test("assigns a unique instance id to every physical card", () => {
    let nextId = 0;
    const deck = createDeck(() => `instance-${nextId++}`);

    expect(new Set(deck.map(({ instanceId }) => instanceId)).size).toBe(168);
    expect(deck.every(({ instanceId }) => instanceId.length > 0)).toBe(true);
  });

  test("contains no basic wild or conventional wild draw four", () => {
    expect(CARD_FACES.some(({ faceId }) => faceId === "wild")).toBe(false);
    expect(CARD_FACES.some(({ faceId }) => faceId === "wild-draw-4")).toBe(false);
    expect(CARD_FACES.some(({ faceId }) => faceId === "wild-reverse-draw-4")).toBe(true);
  });

  test("does not expose mutable face definitions", () => {
    expect(Object.isFrozen(CARD_FACES)).toBe(true);
    expect(CARD_FACES.every((face) => Object.isFrozen(face))).toBe(true);
  });

  test("shuffles without mutating or losing cards", () => {
    let nextId = 0;
    const deck = createDeck(() => `shuffle-${nextId++}`);
    const original = [...deck];
    const shuffled = shuffleDeck(deck, () => 0);

    expect(deck).toEqual(original);
    expect(shuffled).not.toBe(deck);
    expect(shuffled).toHaveLength(deck.length);
    expect(shuffled.map(({ instanceId }) => instanceId).sort()).toEqual(
      deck.map(({ instanceId }) => instanceId).sort(),
    );
    expect(shuffled).not.toEqual(deck);
  });
});
