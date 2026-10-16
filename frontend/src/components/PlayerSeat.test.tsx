import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findCard } from "../game/cards";
import { calculateHandOverlap, PlayerSeat } from "./PlayerSeat";

describe("PlayerSeat static cards", () => {
  it("renders hand cards strictly static with zero hover elevation, tilt, or floating", () => {
    const card = findCard("blue-0");
    render(
      <PlayerSeat
        active
        cardIds={["c1"]}
        cards={[card]}
        count={1}
        name="You"
        orientation="horizontal"
        points={0}
        position="bottom"
      />
    );
    const cardElement = screen.getByRole("article", { name: /blue 0/i });
    expect(cardElement).toHaveAttribute("data-card-instance-id", "c1");
    expect(cardElement.className).not.toContain("game-card--interactive-lift");
    expect(cardElement.style.transform).toBe("none");
    expect(cardElement.style.transition).toBe("none");
  });
});

describe("Dynamic card squashing", () => {
  it("calculates baseline overlap for 7 cards or fewer", () => {
    expect(calculateHandOverlap(1)).toBe(42);
    expect(calculateHandOverlap(7)).toBe(42);
  });

  it("dynamically increases overlap for large hands while leaving at least 34px visible", () => {
    const overlap18 = calculateHandOverlap(18, 100, 900);
    // Overlap should be greater than 42px
    expect(overlap18).toBeGreaterThan(42);
    // Visible edge must be at least 34px (so overlap <= 66px)
    expect(overlap18).toBeLessThanOrEqual(66);

    const overlap24 = calculateHandOverlap(24, 100, 900);
    expect(overlap24).toBeGreaterThanOrEqual(65);
    expect(100 - overlap24).toBeGreaterThanOrEqual(34);
  });

  it("applies --dynamic-overlap CSS variable on bottom hand container based on card count", () => {
    const card = findCard("blue-0");
    const cards = Array.from({ length: 18 }, () => card);
    const cardIds = cards.map((_, i) => `c${i}`);
    const { container } = render(
      <PlayerSeat
        active
        cardIds={cardIds}
        cards={cards}
        count={18}
        name="You"
        orientation="horizontal"
        points={0}
        position="bottom"
      />
    );
    const hand = container.querySelector(".player-seat__hand") as HTMLElement;
    expect(hand).toBeInTheDocument();
    expect(hand.style.getPropertyValue("--dynamic-overlap")).toMatch(/^-?\d+px$/);
  });
});
