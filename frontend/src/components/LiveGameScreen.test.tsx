import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { PlayerSnapshot } from "../game/protocol";
import { LiveGameScreen } from "./LiveGameScreen";
import "../index.css";

afterEach(cleanup);

function createGameSnapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    roomCode: "ABCDEF",
    hostPlayerId: "p1",
    viewerId: "p1",
    revision: 10,
    phase: "playing",
    players: [
      { id: "p1", name: "Alice", order: 0, cardCount: 3, online: true, eliminated: false },
      { id: "p2", name: "Bob", order: 1, cardCount: 5, online: true, eliminated: false },
      { id: "p3", name: "Charlie", order: 2, cardCount: 4, online: true, eliminated: false },
      { id: "p4", name: "Dave", order: 3, cardCount: 2, online: true, eliminated: false },
    ],
    hand: [
      { instanceId: "card-1", faceId: "red-5" },
      { instanceId: "card-2", faceId: "blue-draw-2" },
      { instanceId: "card-3", faceId: "wild-draw-6" },
    ],
    drawCount: 120,
    topDiscard: { faceId: "red-7" },
    currentPlayerId: "p1",
    direction: 1,
    activeColor: "red",
    pendingChoice: null,
    drawStack: null,
    unoWindow: null,
    winner: null,
    legalCardIds: ["card-1", "card-3"],
    allowedControls: ["play-card", "draw-until-playable"],
    ...overrides,
  };
}

describe("LiveGameScreen", () => {
  describe("board projection from server snapshot", () => {
    test("renders viewer hand faces, opponent card counts, draw pile count, and discard card", () => {
      const snapshot = createGameSnapshot();
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      // Viewer hand cards
      expect(screen.getByRole("article", { name: "red 5 card" })).toBeInTheDocument();
      expect(screen.getByRole("article", { name: "blue Draw 2 card" })).toBeInTheDocument();
      expect(screen.getByRole("article", { name: "Wild Draw 6 card" })).toBeInTheDocument();

      // Top discard card
      expect(screen.getByRole("article", { name: "red 7 card" })).toBeInTheDocument();

      // Draw pile count
      expect(screen.getByText("120")).toBeInTheDocument();

      // Opponents rendered with card count
      expect(screen.getByText("Bob")).toBeInTheDocument();
      expect(screen.getByText("Charlie")).toBeInTheDocument();
      expect(screen.getByText("Dave")).toBeInTheDocument();
    });

    test("projects active color diamond and play direction", () => {
      const snapshot = createGameSnapshot({
        activeColor: "blue",
        direction: -1,
      });
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      expect(screen.getByLabelText("Current color: blue")).toBeInTheDocument();
      expect(screen.getByRole("img", { name: "Play direction: counterclockwise" })).toBeInTheDocument();
    });

    test("projects active stack penalty amount", () => {
      const snapshot = createGameSnapshot({
        drawStack: { amount: 8, minimumDrawValue: 4 },
      });
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      expect(screen.getByLabelText("Stack penalty: draw 8")).toBeInTheDocument();
      expect(screen.getByText("+8")).toBeInTheDocument();
    });

    test("projects eliminated and offline player states", () => {
      const snapshot = createGameSnapshot({
        players: [
          { id: "p1", name: "Alice", order: 0, cardCount: 3, online: true, eliminated: false },
          { id: "p2", name: "Bob", order: 1, cardCount: 0, online: true, eliminated: true },
          { id: "p3", name: "Charlie", order: 2, cardCount: 4, online: false, eliminated: false },
        ],
      });
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      expect(screen.getByText("Eliminated")).toBeInTheDocument();
      expect(screen.getByText("Offline")).toBeInTheDocument();
    });

    test("displays game winner screen when winner is declared", () => {
      const snapshot = createGameSnapshot({
        phase: "finished",
        winner: "p1",
      });
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      expect(screen.getByText(/winner/i)).toBeInTheDocument();
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });
  });

  describe("player interactions and commands", () => {
    test("clicking a legal card sends play-card command; illegal card cannot be played", () => {
      const onCommand = vi.fn();
      const snapshot = createGameSnapshot({
        legalCardIds: ["card-1"], // Only card-1 (red-5) is legal
      });
      render(<LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      // card-2 is blue-draw-2 (illegal)
      const illegalCard = screen.getByRole("article", { name: "blue Draw 2 card" });
      fireEvent.click(illegalCard);
      expect(onCommand).not.toHaveBeenCalled();

      // card-1 is red-5 (legal)
      const legalCard = screen.getByRole("article", { name: "red 5 card" });
      fireEvent.click(legalCard);
      expect(onCommand).toHaveBeenCalledWith({
        type: "play-card",
        cardId: "card-1",
      });
    });

    test("clicking draw pile sends draw-until-playable when allowed", () => {
      const onCommand = vi.fn();
      const snapshot = createGameSnapshot({
        allowedControls: ["draw-until-playable"],
      });
      render(<LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      const drawButton = screen.getByRole("button", { name: /draw cards|draw pile/i });
      fireEvent.click(drawButton);

      expect(onCommand).toHaveBeenCalledWith({
        type: "draw-until-playable",
      });
    });

    test("clicking accept-draw sends accept-draw when draw stack is active", () => {
      const onCommand = vi.fn();
      const snapshot = createGameSnapshot({
        drawStack: { amount: 6, minimumDrawValue: 2 },
        allowedControls: ["accept-draw"],
      });
      render(<LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      const acceptButton = screen.getByRole("button", { name: /accept draw|take \+6/i });
      fireEvent.click(acceptButton);

      expect(onCommand).toHaveBeenCalledWith({
        type: "accept-draw",
      });
    });

    test("renders choose-color dialog when viewer has pending color choice", () => {
      const onCommand = vi.fn();
      const snapshot = createGameSnapshot({
        pendingChoice: { type: "choose-color", playerId: "p1" },
      });
      render(<LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      expect(screen.getByRole("heading", { name: /choose a color/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /yellow/i }));
      expect(onCommand).toHaveBeenCalledWith({
        type: "choose-color",
        color: "yellow",
      });
    });

    test("renders choose-swap-target dialog when viewer has pending swap choice", () => {
      const onCommand = vi.fn();
      const snapshot = createGameSnapshot({
        pendingChoice: { type: "choose-swap-target", playerId: "p1" },
      });
      render(<LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      expect(screen.getByRole("heading", { name: /swap hands/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Bob" }));
      expect(onCommand).toHaveBeenCalledWith({
        type: "choose-swap-target",
        targetPlayerId: "p2",
      });
    });

    test("renders choose-roulette-color dialog when viewer has roulette choice", () => {
      const onCommand = vi.fn();
      const snapshot = createGameSnapshot({
        pendingChoice: { type: "choose-roulette-color", playerId: "p1" },
      });
      render(<LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      expect(screen.getByRole("heading", { name: /color roulette/i })).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /green/i }));
      expect(onCommand).toHaveBeenCalledWith({
        type: "choose-roulette-color",
        color: "green",
      });
    });

    test("UNO button declares UNO when declare-uno is allowed", () => {
      const onCommand = vi.fn();
      const snapshot = createGameSnapshot({
        allowedControls: ["declare-uno"],
      });
      render(<LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      const unoButton = screen.getByRole("button", { name: /call uno|declare uno/i });
      fireEvent.click(unoButton);

      expect(onCommand).toHaveBeenCalledWith({
        type: "declare-uno",
      });
    });

    test("shows reconnect banner during reconnecting state and suppresses interactions", () => {
      const onCommand = vi.fn();
      const snapshot = createGameSnapshot({ legalCardIds: ["card-1"] });
      render(
        <LiveGameScreen
          connectionState="reconnecting"
          onCommand={onCommand}
          onLeaveRoom={vi.fn()}
          reconnectAttempt={3}
          snapshot={snapshot}
        />,
      );

      expect(screen.getByText(/reconnecting.*attempt 3/i)).toBeInTheDocument();

      // Interactions disabled while reconnecting
      const card = screen.getByRole("article", { name: "red 5 card" });
      fireEvent.click(card);
      expect(onCommand).not.toHaveBeenCalled();
    });
  });

  describe("2 to 6 seat layouts", () => {
    test.each([2, 3, 4, 5, 6])(
      "viewer is always placed bottom in a %i-player table with all opponents present",
      (playerCount) => {
        const players = Array.from({ length: playerCount }, (_, i) => ({
          id: `player-${i + 1}`,
          name: `Player ${i + 1}`,
          order: i,
          cardCount: 5,
          online: true,
          eliminated: false,
        }));

        // Test with viewer at different positions
        const viewerId = `player-2`; // Viewer is player 2
        const snapshot = createGameSnapshot({
          viewerId,
          players,
        });

        render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

        // Bottom seat must be the viewer
        const bottomSeat = document.querySelector<HTMLElement>(".player-seat--bottom");
        expect(bottomSeat).not.toBeNull();
        expect(within(bottomSeat!).getByText("Player 2")).toBeInTheDocument();

        // Every other player must appear as an opponent
        for (let i = 1; i <= playerCount; i++) {
          if (`player-${i}` !== viewerId) {
            expect(screen.getByText(`Player ${i}`)).toBeInTheDocument();
          }
        }
      },
    );

    test("eliminated players are not highlighted as current player", () => {
      const snapshot = createGameSnapshot({
        currentPlayerId: "p1", // Viewer's turn
        players: [
          { id: "p1", name: "Alice", order: 0, cardCount: 3, online: true, eliminated: false },
          { id: "p2", name: "Bob", order: 1, cardCount: 0, online: true, eliminated: true },
        ],
      });
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      const bobSeat = screen.getByText("Bob").closest(".player-seat");
      expect(bobSeat).not.toHaveClass("is-active");
    });
  });
});
