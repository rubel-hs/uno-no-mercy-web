import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { findCard } from "../game/cards";
import { PlayerSeat } from "./PlayerSeat";

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
