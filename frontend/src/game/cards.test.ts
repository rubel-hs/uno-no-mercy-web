import { describe, expect, test } from "vitest";
import { cardCatalog, findCard } from "./cards";

const CANONICAL_COLORS = ["red", "yellow", "green", "blue"] as const;

describe("canonical No Mercy card catalog", () => {
  test("contains all 68 canonical card faces and matches backend public IDs", () => {
    // 40 numbers: 0-9 in 4 colors
    for (const color of CANONICAL_COLORS) {
      for (let num = 0; num <= 9; num++) {
        const id = `${color}-${num}`;
        const card = findCard(id);
        expect(card.id).toBe(id);
        expect(card.color).toBe(color);
        expect(card.kind).toBe("number");
        expect(card.assetFile).toBe(`${id}.webp`);
      }
    }

    // 24 colored actions: skip, reverse, draw-2, discard-all, draw-4, skip-everyone
    for (const color of CANONICAL_COLORS) {
      for (const action of [
        "skip",
        "reverse",
        "draw-2",
        "discard-all",
        "draw-4",
        "skip-everyone",
      ]) {
        const id = `${color}-${action}`;
        const card = findCard(id);
        expect(card.id).toBe(id);
        expect(card.color).toBe(color);
        expect(card.assetFile).toBe(`${id}.webp`);
      }
    }

    // 4 wild actions
    const wildIds = [
      "wild-reverse-draw-4",
      "wild-color-roulette",
      "wild-draw-6",
      "wild-draw-10",
    ];
    for (const id of wildIds) {
      const card = findCard(id);
      expect(card.id).toBe(id);
      expect(card.color).toBe("wild");
      expect(card.assetFile).toBe(`${id}.webp`);
    }

    expect(cardCatalog).toHaveLength(68);
  });

  test("contains neither a basic Wild nor a conventional Wild Draw 4", () => {
    expect(() => findCard("wild")).toThrow("Unknown card: wild");
    expect(() => findCard("wild-draw-4")).toThrow("Unknown card: wild-draw-4");

    const ids = cardCatalog.map((c) => c.id);
    expect(ids).not.toContain("wild");
    expect(ids).not.toContain("wild-draw-4");
  });

  test("uses each colored artwork for colored Draw 4", () => {
    for (const color of CANONICAL_COLORS) {
      const card = findCard(`${color}-draw-4`);
      expect(card.color).toBe(color);
      expect(card.family).toBe("Draw 4");
      expect(card.assetFile).toBe(`${color}-draw-4.webp`);
    }
  });

  test("maps Wild Reverse Draw 4 to its wild artwork", () => {
    const card = findCard("wild-reverse-draw-4");
    expect(card.color).toBe("wild");
    expect(card.assetFile).toBe("wild-reverse-draw-4.webp");
  });
});
