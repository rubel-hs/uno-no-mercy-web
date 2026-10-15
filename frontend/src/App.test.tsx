import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";

import App from "./App";
import "./index.css";

afterEach(cleanup);

describe("game board shell", () => {
  test("opens on the room home screen", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Choose your table" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create game room" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join game room" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open dev mode" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "UNO No Mercy game table" })).not.toBeInTheDocument();
  });

  test("opens a frontend-only dev mode hub", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));

    expect(screen.getByRole("heading", { name: "Dev mode" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inspect gameboard" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View all cards" })).toBeInTheDocument();
    expect(screen.getByText("No game server required")).toBeInTheDocument();
  });

  test("opens the gameboard inspector and returns to dev mode", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect gameboard" }));

    expect(screen.getByRole("region", { name: "UNO No Mercy game table" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return to dev mode" }));
    expect(screen.getByRole("heading", { name: "Dev mode" })).toBeInTheDocument();
  });

  test("uses a pointer-only affordance for cards in the player hand", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect gameboard" }));

    const playerCard = document.querySelector<HTMLElement>(
      ".player-seat--bottom .player-seat__card",
    );
    expect(playerCard).not.toBeNull();

    const styles = getComputedStyle(playerCard!);
    expect(styles.cursor).toBe("pointer");
    expect(playerCard!.style.transition).toBe("none");
  });

  test("isolates each game card stacking context so marks and corners cannot bleed over adjacent cards", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect gameboard" }));

    const playerCard = document.querySelector<HTMLElement>(
      ".player-seat--bottom .player-seat__card",
    );
    expect(playerCard).not.toBeNull();

    const styles = getComputedStyle(playerCard!);
    expect(styles.isolation).toBe("isolate");
  });

  test("aligns every player card upright on a flat baseline", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect gameboard" }));

    const playerCards = document.querySelectorAll<HTMLElement>(
      ".player-seat--bottom .player-seat__card",
    );

    expect(playerCards.length).toBeGreaterThan(1);
    for (const card of playerCards) {
      expect(card.style.transform).toBe("none");
    }
  });

  test("keeps hands straight while side cards face the table center", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect gameboard" }));

    const horizontalCards = document.querySelectorAll<HTMLElement>(
      ".player-seat--horizontal .player-seat__card",
    );
    const leftCards = document.querySelectorAll<HTMLElement>(
      ".player-seat--left .player-seat__card",
    );
    const rightCards = document.querySelectorAll<HTMLElement>(
      ".player-seat--right .player-seat__card",
    );
    const sideHands = document.querySelectorAll<HTMLElement>(
      ".player-seat--vertical .player-seat__hand",
    );

    for (const card of horizontalCards) {
      expect(card.style.transform).toBe("none");
    }
    for (const card of leftCards) {
      expect(card.style.transform).toBe("rotate(90deg)");
    }
    for (const card of rightCards) {
      expect(card.style.transform).toBe("rotate(-90deg)");
    }
    for (const hand of sideHands) {
      expect(getComputedStyle(hand).transform).toBe("none");
    }
  });

  test("shows straight center cards without pile captions", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect gameboard" }));

    const centerCards = document.querySelectorAll<HTMLElement>(
      ".table-center .game-card",
    );

    expect(centerCards).toHaveLength(2);
    for (const card of centerCards) {
      expect(getComputedStyle(card).transform).toBe("none");
    }
    expect(screen.queryByText("Draw pile")).not.toBeInTheDocument();
    expect(screen.queryByText("Discard")).not.toBeInTheDocument();
  });

  test("disables native dragging for card artwork", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect gameboard" }));

    const cardArtwork = document.querySelectorAll<HTMLImageElement>(
      ".game-card__artwork",
    );

    expect(cardArtwork.length).toBeGreaterThan(0);
    for (const image of cardArtwork) {
      expect(image.draggable).toBe(false);
    }
  });

  test("shows points with each username and marks the current player inline", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Inspect gameboard" }));

    const playerScores = document.querySelectorAll(".player-seat__score");
    const currentPlayers = document.querySelectorAll(".player-seat.is-active");

    expect(playerScores).toHaveLength(4);
    expect(screen.getByLabelText("You, 0 points, current player")).toBeInTheDocument();
    expect(currentPlayers).toHaveLength(1);
    expect(screen.queryByText("Current turn")).not.toBeInTheDocument();
    expect(screen.queryByText("Your move")).not.toBeInTheDocument();
  });

  test("opens the complete card catalog and returns to dev mode", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));
    fireEvent.click(screen.getByRole("button", { name: "View all cards" }));

    expect(screen.getByRole("heading", { name: "Card design system" })).toBeInTheDocument();

    const requiredCardFamilies = [
      "Number",
      "Skip",
      "Reverse",
      "Draw 2",
      "Draw 4",
      "Discard All",
      "Skip Everyone",
      "Wild",
      "Wild Draw 6",
      "Wild Draw 10",
      "Wild Reverse Draw 4",
      "Wild Color Roulette",
    ];

    for (const family of requiredCardFamilies) {
      expect(screen.getByText(family, { selector: "h3" })).toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: "Return to dev mode" }));
    expect(screen.getByRole("heading", { name: "Dev mode" })).toBeInTheDocument();
  });

  test("displays full filenames for card specimens without truncation ellipsis", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));
    fireEvent.click(screen.getByRole("button", { name: "View all cards" }));

    const filenameElements = document.querySelectorAll<HTMLElement>(".card-specimen code");
    expect(filenameElements.length).toBeGreaterThan(0);

    const firstFilename = filenameElements[0];
    expect(firstFilename.textContent).toBe("red-0.webp");
    expect(firstFilename.getAttribute("title")).toBe("red-0.webp");

    const computed = getComputedStyle(firstFilename);
    expect(computed.textOverflow).not.toBe("ellipsis");
    expect(computed.whiteSpace).toBe("normal");
  });
});
