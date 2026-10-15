import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import App from "../App";
import * as roomsApi from "../api/rooms";
import { RoomApiError } from "../api/rooms";
import * as gameSocketModule from "../api/gameSocket";
import type { GameSocketClient, GameSocketOptions } from "../api/gameSocket";
import type { PlayerSnapshot, RoomCredentials, ServerMessage } from "../game/protocol";
import { clearSession, saveSession, SESSION_STORAGE_KEY } from "../game/session";
import "../index.css";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearSession();
});

const credentialsFixture: RoomCredentials = {
  roomCode: "ABCDEF",
  playerId: "host-id",
  token: "token-host-123",
};

function createLobbySnapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    roomCode: "ABCDEF",
    hostPlayerId: "host-id",
    viewerId: "host-id",
    revision: 1,
    phase: "lobby",
    players: [
      {
        id: "host-id",
        name: "Alice",
        order: 0,
        cardCount: 0,
        online: true,
        eliminated: false,
      },
    ],
    hand: [],
    drawCount: 168,
    topDiscard: null,
    currentPlayerId: null,
    direction: 1,
    activeColor: null,
    pendingChoice: null,
    drawStack: null,
    unoWindow: null,
    winner: null,
    legalCardIds: [],
    allowedControls: ["start-game", "leave-room"],
    ...overrides,
  };
}

class MockSocketClient implements GameSocketClient {
  sentCommands: any[] = [];
  options: GameSocketOptions;
  isClosed = false;

  constructor(options: GameSocketOptions) {
    this.options = options;
  }

  send(command: any): string {
    this.sentCommands.push(command);
    return "cmd-1";
  }

  leave(): void {
    this.sentCommands.push({ type: "leave-room" });
    this.isClosed = true;
    this.options.onConnectionStateChange?.("closed");
  }

  close(): void {
    this.isClosed = true;
    this.options.onConnectionStateChange?.("closed");
  }

  // Test helpers to simulate server push
  emitSnapshot(snapshot: PlayerSnapshot) {
    this.options.onSnapshot(snapshot);
  }

  emitForfeit() {
    this.options.onForfeit?.();
  }
}

describe("multiplayer room and lobby flow", () => {
  let mockSocket: MockSocketClient | null = null;

  beforeEach(() => {
    mockSocket = null;
    vi.spyOn(gameSocketModule, "createGameSocket").mockImplementation((options) => {
      mockSocket = new MockSocketClient(options);
      // Immediately emit lobby snapshot so the UI enters lobby
      const snapshot = createLobbySnapshot({
        roomCode: options.credentials.roomCode,
        viewerId: options.credentials.playerId,
      });
      setTimeout(() => {
        mockSocket?.emitSnapshot(snapshot);
      }, 0);
      return mockSocket;
    });
  });

  describe("create room flow", () => {
    test("opens create room dialog from home button and submits display name", async () => {
      const createSpy = vi.spyOn(roomsApi, "createRoom").mockResolvedValue(credentialsFixture);

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "Create game room" }));

      expect(screen.getByRole("heading", { name: /host a table|create room/i })).toBeInTheDocument();

      const nameInput = screen.getByLabelText(/your name|display name/i);
      fireEvent.change(nameInput, { target: { value: "Alice" } });

      fireEvent.click(screen.getByRole("button", { name: "Confirm create room" }));

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledWith("Alice");
      });

      // Enters lobby with room code
      await waitFor(() => {
        expect(screen.getByText("ABCDEF")).toBeInTheDocument();
        expect(screen.getByText("Alice")).toBeInTheDocument();
      });

      // Session saved in sessionStorage
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(
        JSON.stringify(credentialsFixture),
      );
    });

    test("displays server error inline within dialog without closing it", async () => {
      vi.spyOn(roomsApi, "createRoom").mockRejectedValue(
        new RoomApiError("INVALID_NAME", "Enter a name between 1 and 24 characters.", 400),
      );

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "Create game room" }));
      const nameInput = screen.getByLabelText(/your name|display name/i);
      fireEvent.change(nameInput, { target: { value: " " } });

      fireEvent.click(screen.getByRole("button", { name: "Confirm create room" }));

      await waitFor(() => {
        expect(screen.getByText("Enter a name between 1 and 24 characters.")).toBeInTheDocument();
      });

      // Dialog is still open
      expect(screen.getByRole("heading", { name: /host a table|create room/i })).toBeInTheDocument();
    });
  });

  describe("join room flow", () => {
    test("opens join room dialog, submits room code and display name, and enters lobby", async () => {
      const guestCreds: RoomCredentials = {
        roomCode: "XYZ789",
        playerId: "guest-id",
        token: "guest-token",
      };
      const joinSpy = vi.spyOn(roomsApi, "joinRoom").mockResolvedValue(guestCreds);

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "Join game room" }));

      expect(screen.getByRole("heading", { name: /join a table|join room/i })).toBeInTheDocument();

      const codeInput = screen.getByLabelText(/room code/i);
      const nameInput = screen.getByLabelText(/your name|display name/i);

      fireEvent.change(codeInput, { target: { value: "xyz789" } });
      fireEvent.change(nameInput, { target: { value: "Bob" } });

      fireEvent.click(screen.getByRole("button", { name: "Confirm join room" }));

      await waitFor(() => {
        expect(joinSpy).toHaveBeenCalledWith("XYZ789", "Bob");
      });

      await waitFor(() => {
        expect(screen.getByText("XYZ789")).toBeInTheDocument();
      });

      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(
        JSON.stringify(guestCreds),
      );
    });

    test("displays room-not-found error inline when join fails", async () => {
      vi.spyOn(roomsApi, "joinRoom").mockRejectedValue(
        new RoomApiError("ROOM_NOT_FOUND", "Room not found.", 404),
      );

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "Join game room" }));
      fireEvent.change(screen.getByLabelText(/room code/i), { target: { value: "ABCDEF" } });
      fireEvent.change(screen.getByLabelText(/your name|display name/i), { target: { value: "Bob" } });

      fireEvent.click(screen.getByRole("button", { name: "Confirm join room" }));

      await waitFor(() => {
        expect(screen.getByText("Room not found.")).toBeInTheDocument();
      });
    });
  });

  describe("lobby screen controls", () => {
    test("renders room code, players list, occupancy, and host-only start control", async () => {
      vi.spyOn(roomsApi, "createRoom").mockResolvedValue(credentialsFixture);

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "Create game room" }));
      fireEvent.change(screen.getByLabelText(/your name|display name/i), { target: { value: "Alice" } });
      fireEvent.click(screen.getByRole("button", { name: "Confirm create room" }));

      await waitFor(() => {
        expect(screen.getByText("ABCDEF")).toBeInTheDocument();
      });

      // 1 player in lobby: start button should be disabled (< 2 players)
      const startButton = screen.getByRole("button", { name: /start game/i });
      expect(startButton).toBeDisabled();
      expect(screen.getByText(/1 \/ 6/i)).toBeInTheDocument();

      // Simulate second player joining
      mockSocket?.emitSnapshot(
        createLobbySnapshot({
          players: [
            {
              id: "host-id",
              name: "Alice",
              order: 0,
              cardCount: 0,
              online: true,
              eliminated: false,
            },
            {
              id: "guest-id",
              name: "Bob",
              order: 1,
              cardCount: 0,
              online: true,
              eliminated: false,
            },
          ],
        }),
      );

      await waitFor(() => {
        expect(screen.getByText("Bob")).toBeInTheDocument();
        expect(screen.getByText(/2 \/ 6/i)).toBeInTheDocument();
        expect(startButton).toBeEnabled();
      });

      // Host clicks start game
      fireEvent.click(startButton);
      expect(mockSocket?.sentCommands).toContainEqual({ type: "start-game" });
    });

    test("non-host player does not have a start game button", async () => {
      const guestCreds: RoomCredentials = {
        roomCode: "ABCDEF",
        playerId: "guest-id",
        token: "guest-token",
      };
      vi.spyOn(roomsApi, "joinRoom").mockResolvedValue(guestCreds);

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "Join game room" }));
      fireEvent.change(screen.getByLabelText(/room code/i), { target: { value: "ABCDEF" } });
      fireEvent.change(screen.getByLabelText(/your name|display name/i), { target: { value: "Bob" } });
      fireEvent.click(screen.getByRole("button", { name: "Confirm join room" }));

      await waitFor(() => {
        expect(screen.getByText("ABCDEF")).toBeInTheDocument();
      });

      // Non-host: Start game button is not present, waiting text is shown
      expect(screen.queryByRole("button", { name: /start game/i })).not.toBeInTheDocument();
      expect(screen.getByText(/waiting for host/i)).toBeInTheDocument();
    });

    test("intentional leave returns home and clears session storage", async () => {
      vi.spyOn(roomsApi, "createRoom").mockResolvedValue(credentialsFixture);

      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "Create game room" }));
      fireEvent.change(screen.getByLabelText(/your name|display name/i), { target: { value: "Alice" } });
      fireEvent.click(screen.getByRole("button", { name: "Confirm create room" }));

      await waitFor(() => {
        expect(screen.getByText("ABCDEF")).toBeInTheDocument();
      });

      const leaveButton = screen.getByRole("button", { name: /leave room/i });
      fireEvent.click(leaveButton);

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Choose your table" })).toBeInTheDocument();
      });

      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
      expect(mockSocket?.sentCommands).toContainEqual({ type: "leave-room" });
    });
  });

  describe("reload session and dev mode isolation", () => {
    test("saved session automatically reconnects on mount", async () => {
      saveSession(credentialsFixture);

      render(<App />);

      await waitFor(() => {
        expect(gameSocketModule.createGameSocket).toHaveBeenCalledWith(
          expect.objectContaining({ credentials: credentialsFixture }),
        );
      });

      await waitFor(() => {
        expect(screen.getByText("ABCDEF")).toBeInTheDocument();
      });
    });

    test("forfeit event clears saved session and returns to home screen", async () => {
      saveSession(credentialsFixture);

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText("ABCDEF")).toBeInTheDocument();
      });

      mockSocket?.emitForfeit();

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "Choose your table" })).toBeInTheDocument();
      });
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    });

    test("dev mode still opens without constructing a room socket", () => {
      render(<App />);

      fireEvent.click(screen.getByRole("button", { name: "Open dev mode" }));

      expect(screen.getByRole("heading", { name: "Dev mode" })).toBeInTheDocument();
      expect(gameSocketModule.createGameSocket).not.toHaveBeenCalled();
    });
  });
});
