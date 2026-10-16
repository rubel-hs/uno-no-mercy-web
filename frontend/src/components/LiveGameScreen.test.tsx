import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, test, vi } from "vitest";

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
    matchStatus: "round-active",
    roundNumber: 3,
    targetScore: 1000,
    scores: [
      { playerId: "p2", points: 900 },
      { playerId: "p1", points: 400 },
      { playerId: "p4", points: 0 },
      { playerId: "p3", points: 250 },
    ],
    roundResult: null,
    matchWinner: null,
    ...overrides,
  };
}

function createRoundSnapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return createGameSnapshot({
    phase: "finished",
    matchStatus: "round-complete",
    winner: "p1",
    currentPlayerId: null,
    legalCardIds: [],
    allowedControls: ["start-next-round", "leave-room"],
    scores: [
      { playerId: "p1", points: 780 },
      { playerId: "p2", points: 900 },
      { playerId: "p3", points: 250 },
      { playerId: "p4", points: 0 },
    ],
    roundResult: {
      roundNumber: 3,
      winnerId: "p1",
      breakdown: [
        { playerId: "p1", cardPoints: 130, eliminationBonus: 250, roundPoints: 380, cumulativePoints: 780 },
        { playerId: "p2", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 900 },
        { playerId: "p3", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 250 },
        { playerId: "p4", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 0 },
      ],
      matchWinnerId: null,
    },
    ...overrides,
  });
}

describe("LiveGameScreen", () => {
  describe("server-driven match scores and results", () => {
    test.each([
      { matchStatus: "round-complete" as const, title: "Round 3 complete" },
      { matchStatus: "match-complete" as const, title: "Match complete" },
    ])("moves initial focus to the accessible $title heading", ({ matchStatus, title }) => {
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={createRoundSnapshot({ matchStatus })} />);

      const dialog = screen.getByRole("dialog", { name: title });
      expect(within(dialog).getByRole("heading", { name: title })).toHaveFocus();
    });

    test("keeps forward and reverse Tab navigation inside the result dialog", () => {
      render(
        <>
          <button type="button">Outside the dialog</button>
          <LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={createRoundSnapshot()} />
        </>,
      );
      const title = screen.getByRole("heading", { name: "Round 3 complete" });
      const first = screen.getByRole("region", { name: "Round score details" });
      const last = screen.getByRole("button", { name: "Return to Lobby" });

      title.focus();
      fireEvent.keyDown(title, { key: "Tab" });
      expect(first).toHaveFocus();

      last.focus();
      fireEvent.keyDown(last, { key: "Tab" });
      expect(first).toHaveFocus();

      fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
      expect(last).toHaveFocus();

      title.focus();
      fireEvent.keyDown(title, { key: "Tab", shiftKey: true });
      expect(last).toHaveFocus();
    });

    test("skips disabled result actions while reconnecting and retains a focus fallback", () => {
      const snapshot = createRoundSnapshot();
      const { rerender } = render(<LiveGameScreen connectionState="reconnecting" onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);
      const details = screen.getByRole("region", { name: "Round score details" });
      details.focus();
      fireEvent.keyDown(details, { key: "Tab" });
      expect(details).toHaveFocus();
      fireEvent.keyDown(details, { key: "Tab", shiftKey: true });
      expect(details).toHaveFocus();

      rerender(<LiveGameScreen connectionState="reconnecting" onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={{ ...snapshot, roundResult: null }} />);
      const dialog = screen.getByRole("dialog", { name: "Round 3 complete" });
      fireEvent.keyDown(dialog, { key: "Tab" });
      expect(screen.getByRole("heading", { name: "Round 3 complete" })).toHaveFocus();
      fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
      expect(screen.getByRole("heading", { name: "Round 3 complete" })).toHaveFocus();
    });

    test("renders cumulative points by player ID on every active seat", () => {
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={createGameSnapshot()} />);

      for (const [name, points] of [["Alice", 400], ["Bob", 900], ["Charlie", 250], ["Dave", 0]] as const) {
        const seat = screen.getByRole("region", { name: new RegExp(`${name}, ${points} points`) });
        expect(within(seat).getByText(String(points))).toBeInTheDocument();
      }
    });

    test("shows the round winner, public breakdown, and standings ordered by cumulative points", () => {
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={createRoundSnapshot()} />);

      expect(screen.getByRole("heading", { name: "Round 3 complete" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Round winner: Alice" })).toBeInTheDocument();
      const breakdown = screen.getByRole("table", { name: "Round 3 score breakdown" });
      expect(within(breakdown).getByRole("columnheader", { name: "Card points" })).toBeInTheDocument();
      expect(within(breakdown).getByRole("columnheader", { name: "Elimination bonus" })).toBeInTheDocument();
      expect(within(breakdown).getByRole("row", { name: "Alice 130 250 380 780" })).toBeInTheDocument();
      expect(within(breakdown).getByRole("row", { name: "Dave 0 0 0 0" })).toBeInTheDocument();
      const rows = within(screen.getByRole("table", { name: "Cumulative standings" })).getAllByRole("row");
      expect(rows.slice(1).map((row) => row.textContent)).toEqual(["Bob900", "Alice780", "Charlie250", "Dave0"]);
      expect(screen.queryByRole("button", { name: /draw|declare uno/i })).not.toBeInTheDocument();
    });

    test("dispatches start-next-round only from the server-authorized control", () => {
      const onCommand = vi.fn();
      render(<LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={createRoundSnapshot()} />);

      fireEvent.click(screen.getByRole("button", { name: "Next Round" }));
      expect(onCommand).toHaveBeenCalledExactlyOnceWith({ type: "start-next-round" });
    });

    test.each(["p1", "p2"])("keeps viewer %s read-only without a server next-round control", (viewerId) => {
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={createRoundSnapshot({ viewerId, allowedControls: ["leave-room"] })} />);

      expect(screen.getByRole("table", { name: "Cumulative standings" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Next Round" })).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/waiting for host/i);
    });

    test("disables result actions while reconnecting and retains scores", () => {
      const onCommand = vi.fn();
      const onLeaveRoom = vi.fn();
      render(<LiveGameScreen connectionState="reconnecting" reconnectAttempt={4} onCommand={onCommand} onLeaveRoom={onLeaveRoom} snapshot={createRoundSnapshot()} />);

      expect(screen.getByRole("status")).toHaveTextContent(/reconnecting.*attempt 4/i);
      const next = screen.getByRole("button", { name: "Next Round" });
      const leave = screen.getByRole("button", { name: "Return to Lobby" });
      expect(next).toBeDisabled();
      expect(leave).toBeDisabled();
      fireEvent.click(next);
      fireEvent.click(leave);
      expect(onCommand).not.toHaveBeenCalled();
      expect(onLeaveRoom).not.toHaveBeenCalled();
      expect(within(screen.getByRole("table", { name: "Cumulative standings" })).getByRole("row", { name: "Alice 780" })).toBeInTheDocument();
    });

    test("shows the final match winner rather than the round winner with no next-round action", () => {
      const snapshot = createRoundSnapshot({
        matchStatus: "match-complete",
        matchWinner: "p2",
        scores: [{ playerId: "p1", points: 780 }, { playerId: "p2", points: 1150 }],
      });
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      expect(screen.getByRole("heading", { name: "Match complete" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Match winner: Bob" })).toBeInTheDocument();
      expect(within(screen.getByRole("table", { name: "Cumulative standings" })).getByRole("row", { name: "Bob 1150" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Next Round" })).not.toBeInTheDocument();
    });

    test("retains historical standings for a departed player", () => {
      const snapshot = createRoundSnapshot({
        players: createGameSnapshot().players.filter((player) => player.id !== "p2"),
      });
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      expect(within(screen.getByRole("table", { name: "Cumulative standings" })).getByRole("row", { name: /p2.*900/ })).toBeInTheDocument();
    });

    test("keeps the next active round on the board even when the prior round result is present", () => {
      const snapshot = createRoundSnapshot({ phase: "playing", matchStatus: "round-active", roundNumber: 4, winner: null, allowedControls: ["draw-and-pass"] });
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      expect(screen.getByRole("region", { name: "UNO No Mercy game table" })).toBeInTheDocument();
      expect(screen.getByRole("region", { name: "Alice, 780 points" })).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("preserves return behavior from the round result", () => {
      const onLeaveRoom = vi.fn();
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={onLeaveRoom} snapshot={createRoundSnapshot()} />);

      fireEvent.click(screen.getByRole("button", { name: "Return to Lobby" }));
      expect(onLeaveRoom).toHaveBeenCalledOnce();
    });
  });

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
        matchStatus: "match-complete",
        matchWinner: "p1",
      });
      render(<LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      expect(screen.getByText(/winner/i)).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Match winner: Alice" })).toBeInTheDocument();
    });
  });

  describe("player interactions and commands", () => {
    test.each([
      { type: "choose-color" as const, button: "Yellow", command: { type: "choose-color", color: "yellow" } },
      { type: "choose-roulette-color" as const, button: "Green", command: { type: "choose-roulette-color", color: "green" } },
      { type: "choose-swap-target" as const, button: "Bob", command: { type: "choose-swap-target", targetPlayerId: "p2" } },
    ])("blocks $type while reconnecting and resumes dispatch once connected", ({ type, button, command }) => {
      const onCommand = vi.fn();
      const snapshot = createGameSnapshot({ pendingChoice: { type, playerId: "p1" }, allowedControls: [type] });
      const { rerender } = render(<LiveGameScreen connectionState="reconnecting" onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      fireEvent.click(screen.getByRole("button", { name: button }));
      expect(onCommand).not.toHaveBeenCalled();

      rerender(<LiveGameScreen connectionState="connected" onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={snapshot} />);
      fireEvent.click(screen.getByRole("button", { name: button }));
      expect(onCommand).toHaveBeenCalledExactlyOnceWith(command);
    });

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

    test("triggers throw flight animation and buffers top discard when card is played", async () => {
      const onCommand = vi.fn();
      const initialSnapshot = createGameSnapshot({
        legalCardIds: ["card-1"],
        hand: [
          { instanceId: "card-1", faceId: "red-5" },
          { instanceId: "card-2", faceId: "blue-draw-2" },
          { instanceId: "card-3", faceId: "wild-draw-6" },
        ],
        topDiscard: { faceId: "red-7" },
      });

      const { rerender } = render(
        <LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />,
      );

      const discardPile = document.querySelector<HTMLElement>(".pile--discard")!;
      expect(within(discardPile).getByRole("article", { name: "red 7 card" })).toBeInTheDocument();

      const playedCardEl = document.querySelector('[data-card-instance-id="card-1"]')!;
      fireEvent.click(playedCardEl);

      expect(onCommand).toHaveBeenCalledWith({
        type: "play-card",
        cardId: "card-1",
      });

      const overlay = screen.getByTestId("card-flight-overlay");
      expect(overlay).toBeInTheDocument();
      const flightItem = screen.getByTestId(/card-flight-flight-play-card-1/);
      expect(flightItem).toBeInTheDocument();
      expect(within(flightItem).getByRole("article", { name: "red 5 card" })).toBeInTheDocument();

      expect(playedCardEl).toHaveStyle({ visibility: "hidden" });

      const updatedSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-2", faceId: "blue-draw-2" },
          { instanceId: "card-3", faceId: "wild-draw-6" },
        ],
        topDiscard: { faceId: "red-5" },
      });
      rerender(
        <LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={updatedSnapshot} />,
      );

      // Discard pile remains buffered to red-7 while flight is in progress
      expect(within(discardPile).getByRole("article", { name: "red 7 card" })).toBeInTheDocument();
      expect(within(discardPile).queryByRole("article", { name: "red 5 card" })).not.toBeInTheDocument();

      // Hand card slot remains staged
      const stagedSlot = document.querySelector('[data-card-instance-id="card-1"]');
      expect(stagedSlot).toBeInTheDocument();
      expect(stagedSlot).toHaveStyle({ visibility: "hidden" });
    });

    test("clears staged card slot and updates visual discard pile when flight completes", async () => {
      const onCommand = vi.fn();
      const initialSnapshot = createGameSnapshot({
        legalCardIds: ["card-1"],
        hand: [
          { instanceId: "card-1", faceId: "red-5" },
          { instanceId: "card-2", faceId: "blue-draw-2" },
        ],
        topDiscard: { faceId: "red-7" },
      });

      const { rerender } = render(
        <LiveGameScreen flightDuration={0.01} onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />,
      );

      const playedCardEl = document.querySelector('[data-card-instance-id="card-1"]')!;
      fireEvent.click(playedCardEl);

      const updatedSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-2", faceId: "blue-draw-2" },
        ],
        topDiscard: { faceId: "red-5" },
      });
      rerender(
        <LiveGameScreen flightDuration={0.01} onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={updatedSnapshot} />,
      );

      const discardPile = document.querySelector<HTMLElement>(".pile--discard")!;
      await waitFor(() => {
        expect(within(discardPile).getByRole("article", { name: "red 5 card" })).toBeInTheDocument();
      });

      expect(document.querySelector('[data-card-instance-id="card-1"]')).not.toBeInTheDocument();
    });

    test("triggers throw flight animation and buffers discard pile when opponent plays a card", async () => {
      const initialSnapshot = createGameSnapshot({
        currentPlayerId: "p2",
        players: [
          { id: "p1", name: "Alice", order: 0, cardCount: 3, online: true, eliminated: false },
          { id: "p2", name: "Bob", order: 1, cardCount: 5, online: true, eliminated: false },
          { id: "p3", name: "Charlie", order: 2, cardCount: 4, online: true, eliminated: false },
          { id: "p4", name: "Dave", order: 3, cardCount: 2, online: true, eliminated: false },
        ],
        topDiscard: { faceId: "red-7" },
      });

      const { rerender } = render(
        <LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />,
      );

      const discardPile = document.querySelector<HTMLElement>(".pile--discard")!;
      expect(within(discardPile).getByRole("article", { name: "red 7 card" })).toBeInTheDocument();

      const updatedSnapshot = createGameSnapshot({
        currentPlayerId: "p3",
        players: [
          { id: "p1", name: "Alice", order: 0, cardCount: 3, online: true, eliminated: false },
          { id: "p2", name: "Bob", order: 1, cardCount: 4, online: true, eliminated: false },
          { id: "p3", name: "Charlie", order: 2, cardCount: 4, online: true, eliminated: false },
          { id: "p4", name: "Dave", order: 3, cardCount: 2, online: true, eliminated: false },
        ],
        topDiscard: { faceId: "blue-5" },
      });

      rerender(
        <LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={updatedSnapshot} />,
      );

      const overlay = screen.getByTestId("card-flight-overlay");
      expect(overlay).toBeInTheDocument();
      const opponentFlight = screen.getByTestId(/card-flight-flight-opponent-p2/);
      expect(opponentFlight).toBeInTheDocument();
      expect(within(opponentFlight).getByRole("article", { name: "blue 5 card" })).toBeInTheDocument();

      expect(within(discardPile).getByRole("article", { name: "red 7 card" })).toBeInTheDocument();
      expect(within(discardPile).queryByRole("article", { name: "blue 5 card" })).not.toBeInTheDocument();
    });

    test("animates draw flight from draw pile into player hand with staging", async () => {
      const initialSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-1", faceId: "red-5" },
          { instanceId: "card-2", faceId: "blue-draw-2" },
        ],
      });

      const { rerender } = render(
        <LiveGameScreen flightDuration={0.01} onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />,
      );

      const updatedSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-1", faceId: "red-5" },
          { instanceId: "card-2", faceId: "blue-draw-2" },
          { instanceId: "card-3", faceId: "wild-draw-6" },
        ],
        drawCount: 119,
      });

      rerender(
        <LiveGameScreen flightDuration={0.01} onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={updatedSnapshot} />,
      );

      const drawFlight = screen.getByTestId(/card-flight-flight-draw-viewer-card-3/);
      expect(drawFlight).toBeInTheDocument();
      expect(within(drawFlight).getByRole("article", { name: "Wild Draw 6 card" })).toBeInTheDocument();

      const stagedCard = document.querySelector('[data-card-instance-id="card-3"]')!;
      expect(stagedCard).toBeInTheDocument();
      expect(stagedCard).toHaveClass("is-staged-hidden");
      expect(stagedCard).toHaveStyle({ visibility: "hidden" });

      await waitFor(() => {
        expect(stagedCard).not.toHaveClass("is-staged-hidden");
      });
      expect(stagedCard).not.toHaveStyle({ visibility: "hidden" });
    });

    test("animates staggered draw flights for multi-card draw", async () => {
      const initialSnapshot = createGameSnapshot({
        hand: [{ instanceId: "card-1", faceId: "red-5" }],
      });

      const { rerender } = render(
        <LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />,
      );

      const updatedSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-1", faceId: "red-5" },
          { instanceId: "card-2", faceId: "blue-draw-2" },
          { instanceId: "card-3", faceId: "wild-draw-6" },
        ],
        drawCount: 118,
      });

      rerender(
        <LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={updatedSnapshot} />,
      );

      const flight1 = screen.getByTestId(/card-flight-flight-draw-viewer-card-2/);
      const flight2 = screen.getByTestId(/card-flight-flight-draw-viewer-card-3/);
      expect(flight1).toBeInTheDocument();
      expect(flight2).toBeInTheDocument();

      expect(document.querySelector('[data-card-instance-id="card-2"]')).toHaveClass("is-staged-hidden");
      expect(document.querySelector('[data-card-instance-id="card-3"]')).toHaveClass("is-staged-hidden");
    });

    test("animates opponent draw flight from draw pile to opponent seat when opponent card count increases and drawCount decreases", async () => {
      const initialSnapshot = createGameSnapshot({
        players: [
          { id: "p1", name: "Alice", order: 0, cardCount: 3, online: true, eliminated: false },
          { id: "p2", name: "Bob", order: 1, cardCount: 3, online: true, eliminated: false },
        ],
        drawCount: 100,
      });

      const { rerender } = render(
        <LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />,
      );

      const updatedSnapshot = createGameSnapshot({
        players: [
          { id: "p1", name: "Alice", order: 0, cardCount: 3, online: true, eliminated: false },
          { id: "p2", name: "Bob", order: 1, cardCount: 5, online: true, eliminated: false },
        ],
        drawCount: 98,
      });

      rerender(
        <LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={updatedSnapshot} />,
      );

      const opponentFlights = screen.getAllByTestId(/card-flight-flight-draw-opponent-p2/);
      expect(opponentFlights).toHaveLength(2);
      expect(within(opponentFlights[0]).getByRole("article", { name: /card back/i })).toBeInTheDocument();
    });

    test("skips draw flight on initial game deal or round start", async () => {
      const initialSnapshot = createGameSnapshot({
        phase: "lobby",
        hand: [],
      });

      const { rerender } = render(
        <LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />,
      );

      const updatedSnapshot = createGameSnapshot({
        phase: "playing",
        hand: [
          { instanceId: "card-1", faceId: "red-5" },
          { instanceId: "card-2", faceId: "blue-draw-2" },
        ],
      });

      rerender(
        <LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={updatedSnapshot} />,
      );

      expect(screen.queryByTestId(/card-flight-flight-draw-/)).not.toBeInTheDocument();
    });

    test("skips draw flight on 7-0 hand swap when hand changes without drawCount decreasing", async () => {
      const initialSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-1", faceId: "red-5" },
          { instanceId: "card-2", faceId: "blue-draw-2" },
        ],
        drawCount: 100,
      });

      const { rerender } = render(
        <LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />,
      );

      // Hand swap: viewer receives new cards without drawCount changing
      const swappedSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-99", faceId: "green-7" },
          { instanceId: "card-100", faceId: "yellow-0" },
        ],
        drawCount: 100,
      });

      rerender(
        <LiveGameScreen onCommand={vi.fn()} onLeaveRoom={vi.fn()} snapshot={swappedSnapshot} />,
      );

      expect(screen.queryByTestId(/card-flight-flight-draw-/)).not.toBeInTheDocument();
    });

    test("immediately flushes pending flights when player initiates a play action", async () => {
      const onCommand = vi.fn();
      const initialSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-1", faceId: "red-5" },
          { instanceId: "card-2", faceId: "blue-draw-2" },
        ],
        legalCardIds: ["card-1"],
      });

      const { rerender } = render(
        <LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />,
      );

      const updatedSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-1", faceId: "red-5" },
          { instanceId: "card-2", faceId: "blue-draw-2" },
          { instanceId: "card-3", faceId: "wild-draw-6" },
        ],
        drawCount: 119,
        legalCardIds: ["card-1"],
      });

      rerender(
        <LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={updatedSnapshot} />,
      );

      expect(screen.getByTestId(/card-flight-flight-draw-viewer-card-3/)).toBeInTheDocument();
      expect(document.querySelector('[data-card-instance-id="card-3"]')).toHaveClass("is-staged-hidden");

      const card1El = document.querySelector('[data-card-instance-id="card-1"]')!;
      fireEvent.click(card1El);

      expect(screen.queryByTestId(/card-flight-flight-draw-viewer-card-3/)).not.toBeInTheDocument();
      expect(document.querySelector('[data-card-instance-id="card-3"]')).not.toHaveClass("is-staged-hidden");
      expect(onCommand).toHaveBeenCalledWith({ type: "play-card", cardId: "card-1" });
      expect(screen.getByTestId(/card-flight-flight-play-card-1/)).toBeInTheDocument();
    });

    test("immediately flushes pending flights when player clicks draw pile", async () => {
      const onCommand = vi.fn();
      const initialSnapshot = createGameSnapshot({
        hand: [{ instanceId: "card-1", faceId: "red-5" }],
        allowedControls: ["draw-until-playable"],
      });

      const { rerender } = render(
        <LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />,
      );

      const updatedSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-1", faceId: "red-5" },
          { instanceId: "card-2", faceId: "blue-draw-2" },
        ],
        drawCount: 119,
        allowedControls: ["draw-until-playable"],
      });

      rerender(
        <LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={updatedSnapshot} />,
      );

      expect(screen.getByTestId(/card-flight-flight-draw-viewer-card-2/)).toBeInTheDocument();
      expect(document.querySelector('[data-card-instance-id="card-2"]')).toHaveClass("is-staged-hidden");

      const drawButton = screen.getByRole("button", { name: /draw cards|draw pile/i });
      fireEvent.click(drawButton);

      expect(screen.queryByTestId(/card-flight-flight-draw-viewer-card-2/)).not.toBeInTheDocument();
      expect(document.querySelector('[data-card-instance-id="card-2"]')).not.toHaveClass("is-staged-hidden");
      expect(onCommand).toHaveBeenCalledWith({ type: "draw-until-playable" });
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

    test("clicking draw pile sends draw-and-pass when that optional action is allowed", () => {
      const onCommand = vi.fn();
      const snapshot = createGameSnapshot({
        allowedControls: ["play-card", "draw-and-pass"],
      });
      render(<LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={snapshot} />);

      fireEvent.click(screen.getByRole("button", { name: /draw cards|draw pile|draw one card/i }));

      expect(onCommand).toHaveBeenCalledWith({
        type: "draw-and-pass",
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

    test("wraps opponent seats within an opponents-strip container", () => {
      render(
        <LiveGameScreen
          onCommand={vi.fn()}
          onLeaveRoom={vi.fn()}
          snapshot={createGameSnapshot()}
        />,
      );
      expect(document.querySelector(".opponents-strip")).toBeInTheDocument();
    });
  });

  describe("Step-by-step drawing & auto-throw", () => {
    test("stages multi-card draw sequence and reveals one card per click until auto-throw", () => {
      const onCommand = vi.fn();
      const initialSnapshot = createGameSnapshot({
        hand: [{ instanceId: "card-1", faceId: "red-5" }],
        allowedControls: ["draw-until-playable"],
        topDiscard: { faceId: "blue-1" },
      });

      const { rerender } = render(
        <LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />
      );

      // Snapshot after server resolved draw-until-playable: 1 card drawn to hand, 1 card auto-thrown to discard
      const drawSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-1", faceId: "red-5" },
          { instanceId: "card-draw-1", faceId: "green-7" },
        ],
        drawCount: 118,
        allowedControls: [],
        topDiscard: { faceId: "blue-7" },
      });

      rerender(
        <LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={drawSnapshot} />
      );

      // Draw pile prompts to click to draw
      const drawButton = screen.getByRole("button", { name: /draw next|click to draw/i });
      expect(drawButton).toBeInTheDocument();

      const bottomSeat = document.querySelector(".player-seat--bottom") as HTMLElement;
      const discardPile = document.querySelector(".pile--discard") as HTMLElement;

      // Click to draw the hand card
      fireEvent.click(drawButton);
      expect(within(bottomSeat).getByRole("article", { name: /green 7/i })).toBeInTheDocument();

      // Click to draw the final card which auto-throws to discard
      fireEvent.click(drawButton);
      expect(within(discardPile).getByRole("article", { name: /blue 7/i })).toBeInTheDocument();
    });

    test("Wild Color Roulette victim reveals drawn cards one-by-one until matching color is auto-thrown", () => {
      const onCommand = vi.fn();
      const initialSnapshot = createGameSnapshot({
        hand: [{ instanceId: "card-1", faceId: "blue-2" }],
        pendingChoice: { type: "choose-roulette-color", playerId: "p1" },
        topDiscard: { faceId: "wild-color-roulette" },
      });

      const { rerender } = render(
        <LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={initialSnapshot} />
      );

      // Snapshot after server resolved choose-roulette-color: 2 non-matching cards drawn, 1 matching red card auto-thrown
      const rouletteSnapshot = createGameSnapshot({
        hand: [
          { instanceId: "card-1", faceId: "blue-2" },
          { instanceId: "draw-r1", faceId: "yellow-3" },
          { instanceId: "draw-r2", faceId: "green-4" },
        ],
        drawCount: 117,
        activeColor: "red",
        pendingChoice: null,
        topDiscard: { faceId: "red-9" },
      });

      rerender(
        <LiveGameScreen onCommand={onCommand} onLeaveRoom={vi.fn()} snapshot={rouletteSnapshot} />
      );

      const drawButton = screen.getByRole("button", { name: /draw next|click to draw/i });
      expect(drawButton).toBeInTheDocument();

      const bottomSeat = document.querySelector(".player-seat--bottom") as HTMLElement;
      const discardPile = document.querySelector(".pile--discard") as HTMLElement;

      // Card 1: yellow 3
      fireEvent.click(drawButton);
      expect(within(bottomSeat).getByRole("article", { name: /yellow 3/i })).toBeInTheDocument();
      expect(within(bottomSeat).queryByRole("article", { name: /green 4/i })).not.toBeInTheDocument();

      // Card 2: green 4
      fireEvent.click(drawButton);
      expect(within(bottomSeat).getByRole("article", { name: /green 4/i })).toBeInTheDocument();

      // Card 3: matching red 9 auto-thrown to discard
      fireEvent.click(drawButton);
      expect(within(discardPile).getByRole("article", { name: /red 9/i })).toBeInTheDocument();
    });
  });

  describe("mobile responsive portrait layout", () => {
    it("renders all three key board zones (opponents, center table, player hand)", () => {
      const sampleSnapshot = createGameSnapshot();
      render(
        <LiveGameScreen
          onCommand={vi.fn()}
          onLeaveRoom={vi.fn()}
          snapshot={sampleSnapshot}
        />,
      );
      expect(document.querySelector(".opponents-strip")).toBeInTheDocument();
      expect(document.querySelector(".table-center")).toBeInTheDocument();
      expect(document.querySelector(".player-seat--bottom")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Declare UNO" })).toBeInTheDocument();
    });

    it("handles 5 opponents inside opponents-strip without error", () => {
      const sampleSnapshot = createGameSnapshot();
      const fiveOpponentSnapshot = {
        ...sampleSnapshot,
        viewerId: "viewer",
        players: [
          { id: "viewer", name: "You", order: 0, online: true, eliminated: false, cardCount: 7 },
          { id: "p1", name: "Alice", order: 1, online: true, eliminated: false, cardCount: 4 },
          { id: "p2", name: "Bob", order: 2, online: true, eliminated: false, cardCount: 5 },
          { id: "p3", name: "Charlie", order: 3, online: true, eliminated: false, cardCount: 6 },
          { id: "p4", name: "Dave", order: 4, online: true, eliminated: false, cardCount: 2 },
          { id: "p5", name: "Eve", order: 5, online: true, eliminated: false, cardCount: 9 },
        ],
      };
      render(
        <LiveGameScreen
          onCommand={vi.fn()}
          onLeaveRoom={vi.fn()}
          snapshot={fiveOpponentSnapshot}
        />,
      );
      const opponentStrip = document.querySelector(".opponents-strip");
      expect(opponentStrip).toBeInTheDocument();
      expect(opponentStrip?.querySelectorAll(".player-seat").length).toBe(5);
    });

    it("applies display: contents to opponents-strip as desktop default", () => {
      const allRules = Array.from(document.styleSheets).flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules);
        } catch {
          return [];
        }
      });
      const stripRule = allRules.find(
        (rule) =>
          rule instanceof CSSStyleRule &&
          rule.selectorText === ".opponents-strip",
      ) as CSSStyleRule | undefined;

      expect(stripRule?.style.display).toBe("contents");
    });

    it("renders opponent card count badge inside opponent seat", () => {
      render(
        <LiveGameScreen
          onCommand={vi.fn()}
          onLeaveRoom={vi.fn()}
          snapshot={createGameSnapshot()}
        />,
      );
      const opponentStrip = document.querySelector(".opponents-strip");
      const cardCountBadge = opponentStrip?.querySelector(".player-seat__card-count");
      expect(cardCountBadge).toBeInTheDocument();
      expect(cardCountBadge?.querySelector(".player-seat__card-count-icon")).toBeInTheDocument();
    });

    it("defines styling for player-seat__card-count", () => {
      const allRules = Array.from(document.styleSheets).flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules);
        } catch {
          return [];
        }
      });
      const cardCountRule = allRules.find(
        (rule) =>
          rule instanceof CSSStyleRule &&
          rule.selectorText === ".player-seat__card-count",
      ) as CSSStyleRule | undefined;

      expect(cardCountRule?.style.display).toBe("inline-flex");
    });

    it("constrains player-seat--bottom hand with max-width min(100%, 100vw)", () => {
      const allRules = Array.from(document.styleSheets).flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules);
        } catch {
          return [];
        }
      });
      const handRule = allRules.find(
        (rule) =>
          rule instanceof CSSStyleRule &&
          rule.selectorText === ".player-seat--bottom .player-seat__hand",
      ) as CSSStyleRule | undefined;

      expect(handRule?.style.maxWidth).toBe("min(100%, 100vw)");
    });

    it("defines portrait media query rules for mobile responsive game table", () => {
      const allRules = Array.from(document.styleSheets).flatMap((sheet) => {
        try {
          return Array.from(sheet.cssRules);
        } catch {
          return [];
        }
      });
      const mediaRule = allRules.find(
        (rule) =>
          rule instanceof CSSMediaRule &&
          rule.conditionText.includes("max-width: 768px") &&
          rule.conditionText.includes("orientation: portrait"),
      ) as CSSMediaRule | undefined;

      expect(mediaRule).toBeDefined();
    });
  });
});
