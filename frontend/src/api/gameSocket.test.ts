import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { PlayerSnapshot, ServerMessage } from "../game/protocol";
import { SESSION_STORAGE_KEY } from "../game/session";
import { createGameSocket, type GameSocketClient, type GameSocketOptions } from "./gameSocket";

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  url: string;
  protocols?: string | string[];
  readyState: number = WebSocket.CONNECTING;
  sent: string[] = [];

  private listeners: Map<string, Set<(event: any) => void>> = new Map();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = WebSocket.CLOSED;
    this.dispatch("close", { code, reason, wasClean: code === 1000 });
  }

  // Test helpers to trigger events
  open() {
    this.readyState = WebSocket.OPEN;
    this.dispatch("open", {});
  }

  receiveMessage(message: ServerMessage) {
    this.dispatch("message", { data: JSON.stringify(message) });
  }

  triggerError(error: any = new Error("WebSocket error")) {
    this.dispatch("error", { error });
  }

  private dispatch(type: string, event: any) {
    const handlers = this.listeners.get(type);
    if (handlers) {
      for (const handler of Array.from(handlers)) {
        handler(event);
      }
    }
  }
}

const credentialsFixture = {
  roomCode: "ABCDEF",
  playerId: "player-1",
  token: "secret-token-xyz",
};

const snapshotFixture: PlayerSnapshot = {
  roomCode: "ABCDEF",
  hostPlayerId: "player-1",
  viewerId: "player-1",
  revision: 5,
  phase: "lobby",
  players: [
    {
      id: "player-1",
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
  matchStatus: "lobby",
  roundNumber: 0,
  targetScore: 1000,
  scores: [{ playerId: "player-1", points: 0 }],
  roundResult: null,
  matchWinner: null,
};

describe("game WebSocket client", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
    sessionStorage.clear();
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(credentialsFixture));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setupClient(overrides: Partial<GameSocketOptions> = {}): {
    client: GameSocketClient;
    onSnapshot: ReturnType<typeof vi.fn>;
    onRejection: ReturnType<typeof vi.fn>;
    onLifecycle: ReturnType<typeof vi.fn>;
    onConnectionStateChange: ReturnType<typeof vi.fn>;
    onForfeit: ReturnType<typeof vi.fn>;
  } {
    const onSnapshot = vi.fn();
    const onRejection = vi.fn();
    const onLifecycle = vi.fn();
    const onConnectionStateChange = vi.fn();
    const onForfeit = vi.fn();

    const client = createGameSocket({
      credentials: credentialsFixture,
      apiBaseUrl: "http://localhost:3000",
      onSnapshot,
      onRejection,
      onLifecycle,
      onConnectionStateChange,
      onForfeit,
      WebSocketClass: FakeWebSocket as unknown as typeof WebSocket,
      ...overrides,
    });

    return {
      client,
      onSnapshot,
      onRejection,
      onLifecycle,
      onConnectionStateChange,
      onForfeit,
    };
  }

  test("derives ws: url from http: apiBaseUrl and does not expose token in url", () => {
    setupClient();
    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe("ws://localhost:3000/api/rooms/ABCDEF/socket");
    expect(ws.url.includes("secret-token")).toBe(false);
  });

  test("derives wss: url from https: apiBaseUrl", () => {
    setupClient({ apiBaseUrl: "https://game.example/" });
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.url).toBe("wss://game.example/api/rooms/ABCDEF/socket");
  });

  test("sends authentication message immediately upon open", () => {
    setupClient();
    const ws = FakeWebSocket.instances[0]!;
    expect(ws.sent).toHaveLength(0);

    ws.open();

    expect(ws.sent).toHaveLength(1);
    expect(JSON.parse(ws.sent[0]!)).toEqual({
      version: 1,
      type: "authenticate",
      token: credentialsFixture.token,
    });
  });

  test("notifies onSnapshot and tracks the current revision", () => {
    const { client, onSnapshot } = setupClient();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();

    ws.receiveMessage({
      version: 1,
      type: "snapshot",
      snapshot: snapshotFixture,
    });

    expect(onSnapshot).toHaveBeenCalledWith(snapshotFixture);

    // Sending a command should now use the snapshot's revision (5)
    client.send({ type: "draw-until-playable" });
    expect(ws.sent).toHaveLength(2);
    const envelope = JSON.parse(ws.sent[1]!);
    expect(envelope).toEqual({
      version: 1,
      type: "command",
      commandId: expect.any(String),
      revision: 5,
      command: { type: "draw-until-playable" },
    });
  });

  test("notifies onRejection and onLifecycle messages", () => {
    const { onRejection, onLifecycle } = setupClient();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();

    ws.receiveMessage({
      version: 1,
      type: "rejection",
      commandId: "cmd-1",
      code: "out-of-turn",
      message: "It is not your turn.",
      revision: 5,
    });
    expect(onRejection).toHaveBeenCalledWith({
      commandId: "cmd-1",
      code: "out-of-turn",
      message: "It is not your turn.",
      revision: 5,
    });

    ws.receiveMessage({
      version: 1,
      type: "lifecycle",
      event: "player-disconnected",
      playerId: "player-2",
    });
    expect(onLifecycle).toHaveBeenCalledWith({
      event: "player-disconnected",
      playerId: "player-2",
    });
  });

  test("intentional leave sends leave-room command and does not reconnect", () => {
    const { client, onConnectionStateChange } = setupClient();
    const ws = FakeWebSocket.instances[0]!;
    ws.open();

    client.leave();

    // Check that leave-room was sent
    const leaveMsg = ws.sent.find((msg) => {
      try {
        const parsed = JSON.parse(msg);
        return parsed.command?.type === "leave-room";
      } catch {
        return false;
      }
    });
    expect(leaveMsg).toBeDefined();

    // Advancing timers should NOT create any reconnect sockets
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(onConnectionStateChange).not.toHaveBeenCalledWith("reconnecting", expect.anything());
  });

  test("unexpected close retries ten times (1 immediate, 9 every 5,000ms)", () => {
    const { onConnectionStateChange } = setupClient();
    const initialWs = FakeWebSocket.instances[0]!;
    initialWs.open();

    // Unexpected disconnect (code 1006)
    initialWs.close(1006, "Abnormal closure");

    // Attempt 1 is immediate (per SDD ledger ruling)
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(onConnectionStateChange).toHaveBeenCalledWith("reconnecting", 1);

    // Close attempt 1 unexpectedly
    FakeWebSocket.instances[1]!.close(1006, "Failed again");

    // Attempts 2 through 10 run every 5,000ms
    for (let attempt = 2; attempt <= 10; attempt++) {
      vi.advanceTimersByTime(4_999);
      expect(FakeWebSocket.instances).toHaveLength(attempt);

      vi.advanceTimersByTime(1);
      expect(FakeWebSocket.instances).toHaveLength(attempt + 1);
      expect(onConnectionStateChange).toHaveBeenCalledWith("reconnecting", attempt);

      // Close this attempt unexpectedly
      FakeWebSocket.instances[attempt]!.close(1006, "Failed again");
    }

    // Now 10 attempts have been exhausted (total 11 instances: initial + 10 retries)
    expect(FakeWebSocket.instances).toHaveLength(11);
  });

  test("successful reconnect cancels future retries and re-authenticates", () => {
    const { onConnectionStateChange } = setupClient();
    const ws1 = FakeWebSocket.instances[0]!;
    ws1.open();
    ws1.close(1006, "Abnormal closure");

    // Attempt 1 created
    expect(FakeWebSocket.instances).toHaveLength(2);
    const ws2 = FakeWebSocket.instances[1]!;

    // Attempt 2 succeeds: open and receive snapshot
    ws2.open();
    expect(ws2.sent).toHaveLength(1);
    expect(JSON.parse(ws2.sent[0]!)).toEqual({
      version: 1,
      type: "authenticate",
      token: credentialsFixture.token,
    });

    ws2.receiveMessage({
      version: 1,
      type: "snapshot",
      snapshot: { ...snapshotFixture, revision: 6 },
    });

    expect(onConnectionStateChange).toHaveBeenCalledWith("connected");

    // Advancing time should NOT trigger any new reconnect attempts
    vi.advanceTimersByTime(30_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  test("reconnect exhaustion calls onForfeit once, clears session storage, and never creates an eleventh socket", () => {
    const { onForfeit } = setupClient();
    const ws1 = FakeWebSocket.instances[0]!;
    ws1.open();
    ws1.close(1006, "Abnormal closure");

    // Close attempts 1 through 10
    for (let i = 1; i <= 10; i++) {
      const currentWs = FakeWebSocket.instances[i]!;
      currentWs.close(1006, "Failed");
      if (i < 10) {
        vi.advanceTimersByTime(5_000);
      }
    }

    expect(onForfeit).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();

    // Advance 60 more seconds: no eleventh socket is ever created
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(11); // 1 initial + 10 retries
  });
});
