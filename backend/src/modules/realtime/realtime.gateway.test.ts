import { describe, expect, spyOn, test } from "bun:test";
import type { BunWebSocketData } from "hono/bun";
import { createApp } from "../../app";
import { createDeck } from "../game/deck";
import type { ClientCommand, ClientEnvelope, PlayerSnapshot, ServerMessage } from "../game/game.protocol";
import type { PhysicalCard } from "../game/game.types";
import { createRoomStore } from "../rooms/room.store";
import type { RoomPeer, RoomResult, RoomStore } from "../rooms/room.types";
import { createRealtimeSession } from "./realtime.gateway";
import { websocket } from "./realtime.route";

function value<T>(result: RoomResult<T>): T {
  if (!result.ok) throw new Error(`Expected success, got ${result.code}`);
  return result.value;
}

function peer(id = "socket-1", onClose?: () => void) {
  const messages: ServerMessage[] = [];
  const closes: { code?: number; reason?: string }[] = [];
  return {
    id, messages, closes,
    send(message: ServerMessage) { messages.push(structuredClone(message)); },
    close(code?: number, reason?: string) { closes.push({ code, reason }); onClose?.(); },
  } satisfies RoomPeer & { messages: ServerMessage[]; closes: { code?: number; reason?: string }[] };
}

function fixture(token = "private-token-1") {
  let now = 1_000;
  let timerId = 0;
  let tokenId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const store = createRoomStore({
    roomCodeFactory: () => "ABCDEF", tokenFactory: () => tokenId++ === 0 ? token : "private-token-2",
    now: () => now,
    setTimeout: (callback, delay) => { const id = ++timerId; timers.set(id, { at: now + delay, callback }); return id; },
    clearTimeout: (id) => { timers.delete(id as number); },
    random: () => 0.999999,
  });
  const host = value(store.createRoom("Alice"));
  const transport = peer();
  const session = createRealtimeSession(store, host.roomCode, transport);
  const authenticate = () => session.onMessage(JSON.stringify({ version: 1, type: "authenticate", token: host.token }));
  const command = (command: ClientCommand, commandId = "command", revision = store.getRoom("ABCDEF")!.revision) =>
    session.onMessage(JSON.stringify({ version: 1, type: "command", commandId, revision, command }));
  const advance = (ms: number) => {
    now += ms;
    for (const [id, timer] of timers) if (timer.at <= now) { timers.delete(id); timer.callback(); }
  };
  return { store, host, transport, session, authenticate, command, timers, advance };
}

function snapshot(transport: ReturnType<typeof peer>): PlayerSnapshot {
  const latest = transport.messages.findLast((message) => message.type === "snapshot");
  if (!latest || latest.type !== "snapshot") throw new Error("Expected personalized snapshot");
  return latest.snapshot;
}

function rejected(transport: ReturnType<typeof peer>, code: string, commandId?: string) {
  const message = transport.messages.at(-1);
  expect(message).toMatchObject({ version: 1, type: "rejection", code });
  if (!message || message.type !== "rejection") throw new Error("Expected rejection");
  expect(typeof message.message).toBe("string");
  if (commandId === undefined) expect(message).not.toHaveProperty("commandId");
  else expect(message).toHaveProperty("commandId", commandId);
  return message;
}

const winningHand = ["red-discard-all", "red-1", "red-2", "red-3", "red-4", "red-8", "red-9"];
const scoringHands = [winningHand,
  ["wild-draw-6", "blue-1", "blue-2", "blue-3", "blue-4", "blue-8", "blue-9"],
  ["green-draw-4", "green-1", "green-2", "green-3", "green-4", "green-8", "green-9"],
];

// Arrange real canonical deals through injected shuffle samples, including dealer rotation.
function matchFixture(hands = scoringHands) {
  let cards = 0;
  let tokens = 0;
  const samples: number[] = [];
  for (const dealer of [hands.length - 1, 0]) {
    let id = 0;
    const original = createDeck(() => `fixture-${++id}`);
    const remaining = [...original];
    const take = (faceId: string) => {
      const index = remaining.findIndex((card) => card.faceId === faceId);
      if (index < 0) throw new Error(`Fixture exhausted ${faceId}`);
      return remaining.splice(index, 1)[0]!;
    };
    const desired: PhysicalCard[] = [];
    for (let round = 0; round < 7; round++) for (let offset = 1; offset <= hands.length; offset++) {
      desired.push(take(hands[(dealer + offset) % hands.length]![round]!));
    }
    desired.push(take("red-5"), ...remaining);
    const shuffled = [...original];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = shuffled.findIndex((card) => card.instanceId === desired[i]!.instanceId);
      samples.push((j + 0.5) / (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    if (dealer === hands.length - 1) samples.push((dealer + 0.5) / hands.length);
  }
  const store = createRoomStore({
    roomCodeFactory: () => "ABCDEF", tokenFactory: () => `match-secret-${++tokens}`,
    cardIdFactory: () => `physical-${++cards}`, now: () => 1_000,
    setTimeout: () => 0, clearTimeout: () => {},
    random: () => { const sample = samples.shift(); if (sample === undefined) throw new Error("Unexpected shuffle"); return sample; },
  });
  const seats = [value(store.createRoom("Alice"))];
  for (let i = 1; i < hands.length; i++) seats.push(value(store.joinRoom("ABCDEF", ["Bob", "Carol", "Dan"][i - 1]!)));
  const peers = seats.map((seat, i) => {
    const transport = peer(`match-peer-${i}`);
    const session = createRealtimeSession(store, "ABCDEF", transport);
    session.onMessage(JSON.stringify({ version: 1, type: "authenticate", token: seat.token }));
    return { transport, session };
  });
  let commands = 0;
  const command = (index: number, command: ClientCommand) => {
    peers[index]!.session.onMessage(JSON.stringify({ version: 1, type: "command", commandId: `match-command-${++commands}`, revision: store.getRoom("ABCDEF")!.revision, command }));
    expect(peers[index]!.transport.messages.at(-1)?.type).not.toBe("rejection");
  };
  const finish = () => command(0, { type: "play-card", cardId: snapshot(peers[0]!.transport).hand.find(({ faceId }) => faceId === "red-discard-all")!.instanceId });
  return { store, seats, peers, command, finish };
}

describe("public match snapshots", () => {
  // Catches omitting match defaults from either initial authentication or lobby broadcasts.
  test.each([1, 2])("publishes zeroed lobby metadata for %i seats", (count) => {
    const room = fixture();
    const seats = [room.host];
    if (count === 2) seats.push(value(room.store.joinRoom("ABCDEF", "Bob")));
    room.authenticate();
    const before = room.store.getRoom("ABCDEF")!;
    expect(snapshot(room.transport)).toMatchObject({
      matchStatus: "lobby", roundNumber: 0, targetScore: 1000,
      scores: seats.map(({ playerId }) => ({ playerId, points: 0 })), roundResult: null, matchWinner: null,
    });
    expect(snapshot(room.transport).allowedControls).not.toContain("start-next-round");
    expect(room.store.getRoom("ABCDEF")).toEqual(before);
  });

  test("broadcasts identical completed-round breakdowns with host-only next-round control", () => {
    const room = matchFixture();
    room.command(0, { type: "start-game" });
    const before = room.store.getRoom("ABCDEF")!.revision;
    room.finish();
    const winnerId = room.seats[0]!.playerId;
    const breakdown = room.seats.map(({ playerId }, i) => ({ playerId, cardPoints: i === 0 ? 124 : 0, eliminationBonus: 0, roundPoints: i === 0 ? 124 : 0, cumulativePoints: i === 0 ? 124 : 0 }));
    room.peers.forEach(({ transport }, i) => {
      expect(transport.messages.at(-1)).toMatchObject({ version: 1, type: "snapshot", snapshot: {
        matchStatus: "round-complete", roundNumber: 1, targetScore: 1000, revision: before + 1,
        scores: room.seats.map(({ playerId }, j) => ({ playerId, points: j === 0 ? 124 : 0 })),
        roundResult: { roundNumber: 1, winnerId, matchWinnerId: null, breakdown }, matchWinner: null,
      } });
      expect(snapshot(transport).allowedControls).toEqual(i === 0 ? ["leave-room", "start-next-round"] : ["leave-room"]);
    });
  });

  // Catches losing prior results/scores on a new deal or leaking hidden identities through match data.
  test("carries active scores and prior results to all viewers while keeping hands private", () => {
    const room = matchFixture();
    room.command(0, { type: "start-game" });
    for (const { transport } of room.peers) expect(snapshot(transport)).toMatchObject({ matchStatus: "round-active", roundNumber: 1, roundResult: null, matchWinner: null });
    room.finish();
    room.command(0, { type: "start-next-round" });
    const state = room.store.getRoom("ABCDEF")!.game!;
    room.peers.forEach(({ transport }, i) => {
      const projected = snapshot(transport);
      expect(projected).toMatchObject({
        matchStatus: "round-active", roundNumber: 2, targetScore: 1000, matchWinner: null,
        scores: room.seats.map(({ playerId }, j) => ({ playerId, points: j === 0 ? 124 : 0 })),
        roundResult: { roundNumber: 1, winnerId: room.seats[0]!.playerId, matchWinnerId: null },
      });
      expect(projected.hand).toEqual(state.players[i]!.hand);
      expect(projected.allowedControls).not.toContain("start-next-round");
      expect(projected.players.map(({ cardCount }) => cardCount)).toEqual([7, 7, 7]);
      const json = JSON.stringify(projected);
      const hidden = [...state.drawPile, ...state.discardPile, ...state.players.filter((_, j) => i !== j).flatMap(({ hand }) => hand)];
      for (const card of hidden) expect(json).not.toContain(`"${card.instanceId}"`);
      for (const seat of room.seats) expect(json).not.toContain(seat.token);
      for (const key of ["drawPile", "reconnectDeadline", "timer", "scoresByPlayerId", "finalizedRoundNumber", "dealerIndex"]) expect(json).not.toContain(`"${key}"`);
    });
  });

  test("transfers next-round control to the new host and retains departed historical scores", () => {
    const room = matchFixture();
    room.command(0, { type: "start-game" });
    room.finish();
    room.command(0, { type: "leave-room" });
    expect(snapshot(room.peers[1]!.transport)).toMatchObject({ hostPlayerId: room.seats[1]!.playerId, matchStatus: "round-complete" });
    expect(snapshot(room.peers[1]!.transport).allowedControls).toContain("start-next-round");
    expect(snapshot(room.peers[2]!.transport).allowedControls).not.toContain("start-next-round");
    expect(snapshot(room.peers[1]!.transport).scores).toContainEqual({ playerId: room.seats[0]!.playerId, points: 124 });
  });

  // Catches advertising a next round that the retained-seat minimum would reject.
  test("omits next-round control when departures leave only the host seat", () => {
    const room = matchFixture();
    room.command(0, { type: "start-game" });
    room.finish();
    room.command(1, { type: "leave-room" });
    expect(snapshot(room.peers[0]!.transport).allowedControls).toContain("start-next-round");

    room.command(2, { type: "leave-room" });
    expect(room.store.getRoom("ABCDEF")!.players.map(({ id }) => id)).toEqual([room.seats[0]!.playerId]);
    const projected = snapshot(room.peers[0]!.transport);
    expect(projected).toMatchObject({ viewerId: room.seats[0]!.playerId, hostPlayerId: room.seats[0]!.playerId, matchStatus: "round-complete" });
    expect(projected.allowedControls).not.toContain("start-next-round");
  });

  test("publishes final match winner and standings to every viewer without next-round control", () => {
    const hands = [winningHand, Array<string>(7).fill("wild-reverse-draw-4"), Array<string>(7).fill("wild-color-roulette"),
      ["wild-reverse-draw-4", "wild-color-roulette", "wild-draw-6", "wild-draw-6", "wild-draw-6", "wild-draw-6", "wild-draw-10"]];
    const room = matchFixture(hands);
    room.command(0, { type: "start-game" });
    room.finish();
    for (const { transport } of room.peers) {
      const projected = snapshot(transport);
      expect(projected).toMatchObject({
        matchStatus: "match-complete", roundNumber: 1, targetScore: 1000, matchWinner: room.seats[0]!.playerId,
        scores: room.seats.map(({ playerId }, i) => ({ playerId, points: i === 0 ? 1050 : 0 })),
        roundResult: { roundNumber: 1, winnerId: room.seats[0]!.playerId, matchWinnerId: room.seats[0]!.playerId },
      });
      expect(projected.allowedControls).toEqual(["leave-room"]);
    }
  });
});

describe("realtime authentication", () => {
  // Break caught: auth trusts a client identity, skips binding, or invents a public snapshot.
  test("binds the token's existing seat and delivers the store's personalized snapshot", () => {
    const { store, host, transport, authenticate, timers } = fixture();
    authenticate();
    expect(snapshot(transport)).toMatchObject({ roomCode: "ABCDEF", viewerId: host.playerId, revision: 1, phase: "lobby", hand: [] });
    expect(store.getRoom("ABCDEF")?.players).toEqual([{ id: host.playerId, name: "Alice", online: true, reconnectDeadline: null }]);
    expect(timers.size).toBe(0);
    expect(JSON.stringify(transport.messages)).not.toContain(host.token);
    expect(transport.closes).toEqual([]);
  });

  const malformed: [string, unknown][] = [
    ["non-JSON", "secret-token-not-json"], ["empty text", ""], ["JSON null", "null"],
    ["JSON array", "[]"], ["JSON string", '"token"'], ["JSON boolean", "true"],
    ["binary buffer", new TextEncoder().encode('{"version":1,"type":"authenticate","token":"private-token-1"}')],
    ["binary array buffer", new ArrayBuffer(8)], ["decoded object", { version: 1, type: "authenticate", token: "private-token-1" }],
    ["wrong version", '{"version":2,"type":"authenticate","token":"private-token-1"}'],
    ["missing version", '{"type":"authenticate","token":"private-token-1"}'],
    ["missing token", '{"version":1,"type":"authenticate"}'],
    ["numeric token", '{"version":1,"type":"authenticate","token":1}'],
    ["blank token", '{"version":1,"type":"authenticate","token":" "}'],
    ["additional identity", '{"version":1,"type":"authenticate","token":"private-token-1","playerId":"victim"}'],
    ["prototype field", '{"version":1,"type":"authenticate","token":"private-token-1","__proto__":{}}'],
    ["command before authentication", '{"version":1,"type":"command","commandId":"early","revision":0,"command":{"type":"leave-room"}}'],
  ];
  test.each(malformed)("rejects %s before binding and never recovers a failed authentication session", (_, raw) => {
    const { store, transport, session, authenticate } = fixture();
    const before = store.getRoom("ABCDEF");
    expect(() => session.onMessage(raw)).not.toThrow();
    rejected(transport, "INVALID_MESSAGE");
    expect(transport.closes).toHaveLength(1);
    const messages = structuredClone(transport.messages);
    authenticate();
    session.onClose();
    expect(transport.messages).toEqual(messages);
    expect(transport.closes).toHaveLength(1);
    expect(store.getRoom("ABCDEF")).toEqual(before);
  });

  test.each([["ABCDEF", "wrong-token", "INVALID_TOKEN"], ["GHJKLM", "private-token-1", "ROOM_NOT_FOUND"]])(
    "safely rejects authentication in %s with %s", (code, token, errorCode) => {
      const { store, transport } = fixture();
      const before = store.getRoom("ABCDEF");
      const session = createRealtimeSession(store, code!, transport);
      session.onMessage(JSON.stringify({ version: 1, type: "authenticate", token }));
      rejected(transport, errorCode!);
      expect(transport.closes).toHaveLength(1);
      expect(JSON.stringify(transport.messages)).not.toContain(token!);
      expect(store.getRoom("ABCDEF")).toEqual(before);
    },
  );

  test("rejects repeated authentication without replacing identity or changing the room", () => {
    const { store, transport, session, authenticate, command } = fixture();
    const guest = value(store.joinRoom("ABCDEF", "Bob"));
    authenticate();
    const before = store.getRoom("ABCDEF");
    session.onMessage(JSON.stringify({ version: 1, type: "authenticate", token: guest.token }));
    rejected(transport, "INVALID_MESSAGE");
    expect(store.getRoom("ABCDEF")).toEqual(before);
    command({ type: "start-game" });
    expect(snapshot(transport).phase).toBe("playing");
    expect(transport.closes).toHaveLength(0);
  });

  test("accepts exactly 16384 UTF-8 bytes before authentication and rejects the next byte", () => {
    const allowed = fixture();
    const json = JSON.stringify({ version: 1, type: "authenticate", token: allowed.host.token });
    const atLimit = " ".repeat(16_384 - json.length) + json;
    allowed.session.onMessage(atLimit);
    expect(snapshot(allowed.transport).viewerId).toBe(allowed.host.playerId);
    const oversized = fixture();
    const before = oversized.store.getRoom("ABCDEF");
    oversized.session.onMessage(" " + atLimit);
    rejected(oversized.transport, "INVALID_MESSAGE");
    expect(oversized.store.getRoom("ABCDEF")).toEqual(before);
  });

  test("counts multibyte authentication text in UTF-8 bytes before calling the store", () => {
    const { store, transport, session, host } = fixture("é".repeat(8_192));
    const raw = JSON.stringify({ version: 1, type: "authenticate", token: host.token });
    expect(raw.length).toBeLessThan(16_384);
    expect(new TextEncoder().encode(raw).byteLength).toBeGreaterThan(16_384);
    const before = store.getRoom("ABCDEF");
    session.onMessage(raw);
    rejected(transport, "INVALID_MESSAGE");
    expect(store.getRoom("ABCDEF")).toEqual(before);
  });
});

describe("realtime commands", () => {
  const malformed: [string, unknown][] = [
    ["non-JSON", "private-token-1"], ["empty", ""], ["binary", new Uint8Array([123, 125])],
    ["null", "null"], ["array", "[]"], ["wrong protocol version", { version: 2 }],
    ["missing command", { command: undefined }], ["unknown command", { command: { type: "delete-room" } }],
    ["injected actor", { command: { type: "leave-room", playerId: "victim" } }],
    ["additional field", { token: "private-token-1" }], ["overlong command ID", { commandId: "x".repeat(65) }],
    ["missing command ID", { commandId: undefined }], ["blank command ID", { commandId: " " }],
    ["negative revision", { revision: -1 }], ["fractional revision", { revision: 1.5 }],
    ["string revision", { revision: "1" }], ["unsafe revision", { revision: Number.MAX_SAFE_INTEGER + 1 }],
    ["unknown envelope type", { type: "ping" }],
  ];
  test.each(malformed)("rejects %s without trusting an unparsed command ID or changing room revision", (_, input) => {
    const { store, transport, session, authenticate } = fixture();
    authenticate();
    const before = store.getRoom("ABCDEF");
    const raw = input && typeof input === "object" && !ArrayBuffer.isView(input)
      ? JSON.stringify({ version: 1, type: "command", commandId: "untrusted", revision: 1, command: { type: "leave-room" }, ...input }) : input;
    expect(() => session.onMessage(raw)).not.toThrow();
    rejected(transport, "INVALID_MESSAGE");
    expect(store.getRoom("ABCDEF")).toEqual(before);
    expect(transport.closes).toHaveLength(0);
  });

  test("rejects a multibyte oversized command before command validation or store mutation", () => {
    const { store, transport, session, authenticate } = fixture();
    authenticate();
    const before = store.getRoom("ABCDEF");
    const raw = JSON.stringify({ version: 1, type: "command", commandId: "oversized", revision: 1, command: { type: "play-card", cardId: "🎴".repeat(4_096) } });
    expect(raw.length).toBeLessThan(16_384);
    session.onMessage(raw);
    rejected(transport, "INVALID_MESSAGE");
    expect(store.getRoom("ABCDEF")).toEqual(before);
  });

  test("starts via the authenticated identity and relies on separate private store broadcasts", () => {
    const { store, host, transport, authenticate, command } = fixture();
    const guest = value(store.joinRoom("ABCDEF", "Bob"));
    const guestPeer = peer("socket-2");
    createRealtimeSession(store, "ABCDEF", guestPeer).onMessage(JSON.stringify({ version: 1, type: "authenticate", token: guest.token }));
    authenticate();
    transport.messages.length = 0;
    guestPeer.messages.length = 0;
    command({ type: "start-game" }, "start");
    expect(transport.messages).toHaveLength(1);
    expect(guestPeer.messages).toHaveLength(1);
    const first = snapshot(transport);
    const second = snapshot(guestPeer);
    expect(first).toMatchObject({ phase: "playing", viewerId: host.playerId, revision: 4 });
    expect(second).toMatchObject({ phase: "playing", viewerId: guest.playerId, revision: 4 });
    expect(first.hand).toHaveLength(7);
    expect(second.hand).toHaveLength(7);
    for (const card of second.hand) expect(JSON.stringify(first)).not.toContain(card.instanceId);
    expect(JSON.stringify(transport.messages)).not.toContain(host.token);
    expect(JSON.stringify(transport.messages)).not.toContain(guest.token);
  });

  test("returns a safe store rejection with a validated command ID and current revision", () => {
    const { store, transport, authenticate, command } = fixture();
    authenticate();
    const before = store.getRoom("ABCDEF");
    command({ type: "leave-room" }, "stale", 0);
    expect(rejected(transport, "STALE_REVISION", "stale")).toHaveProperty("revision", 1);
    expect(store.getRoom("ABCDEF")).toEqual(before);
    command({ type: "start-game" }, "start");
    rejected(transport, "NOT_ENOUGH_PLAYERS", "start");
    expect(transport.closes).toHaveLength(0);
  });

  test("passes only a valid envelope and bound player identity to a replaceable store", () => {
    const { store, host } = fixture();
    const transport = peer();
    let received: unknown;
    const controlled: RoomStore = { ...store, handleCommand(code, playerId, envelope) {
      received = { code, playerId, envelope };
      return { ok: false, code: "STALE_REVISION", message: host.token, revision: 8 };
    } };
    const session = createRealtimeSession(controlled, "ABCDEF", transport);
    session.onMessage(JSON.stringify({ version: 1, type: "authenticate", token: host.token }));
    const envelope: ClientEnvelope = { version: 1, type: "command", commandId: "valid", revision: 1, command: { type: "choose-color", color: "red" } };
    session.onMessage(JSON.stringify(envelope));
    expect(received).toEqual({ code: "ABCDEF", playerId: host.playerId, envelope });
    expect(rejected(transport, "STALE_REVISION", "valid")).toHaveProperty("revision", 8);
    expect(JSON.stringify(transport.messages)).not.toContain(host.token);
  });
});

describe("realtime termination", () => {
  test("intentional leave removes the seat immediately and later close or messages stay inert", () => {
    const { store, host, transport, session, authenticate, command, timers } = fixture();
    const guest = value(store.joinRoom("ABCDEF", "Bob"));
    authenticate();
    transport.close = (code, reason) => { transport.closes.push({ code, reason }); session.onClose(); };
    command({ type: "leave-room" });
    const after = store.getRoom("ABCDEF");
    expect(after).toMatchObject({ hostPlayerId: guest.playerId, revision: 3, players: [{ id: guest.playerId }] });
    expect(after?.players.some(({ id }) => id === host.playerId)).toBe(false);
    expect(transport.closes).toHaveLength(1);
    expect(timers.size).toBe(1); // Only the guest's original REST-seat timer remains.
    session.onClose();
    authenticate();
    command({ type: "leave-room" }, "late");
    expect(store.getRoom("ABCDEF")).toEqual(after);
    expect(transport.closes).toHaveLength(1);
  });

  test("unexpected close starts exactly one 50-second grace and prevents later commands", () => {
    const { store, transport, session, authenticate, advance, timers } = fixture();
    authenticate();
    session.onClose();
    const after = store.getRoom("ABCDEF");
    expect(after).toMatchObject({ revision: 2, players: [{ online: false, reconnectDeadline: 51_000 }] });
    expect(timers.size).toBe(1);
    session.onClose();
    authenticate();
    expect(store.getRoom("ABCDEF")).toEqual(after);
    expect(transport.closes).toHaveLength(0);
    advance(49_999);
    expect(store.getRoom("ABCDEF")).not.toBeNull();
    advance(1);
    expect(store.getRoom("ABCDEF")).toBeNull();
  });

  test("replacement terminates the old gateway before a stale close or queued command can act", () => {
    const { store, host, transport, session, authenticate, command } = fixture();
    authenticate();
    const replacement = peer("replacement");
    const next = createRealtimeSession(store, "ABCDEF", replacement);
    next.onMessage(JSON.stringify({ version: 1, type: "authenticate", token: host.token }));
    const before = store.getRoom("ABCDEF");
    expect(transport.closes).toHaveLength(1);
    command({ type: "leave-room" }, "stale-socket");
    session.onClose();
    expect(store.getRoom("ABCDEF")).toEqual(before);
    expect(before?.players[0]).toMatchObject({ online: true, reconnectDeadline: null });
    next.onMessage(JSON.stringify({ version: 1, type: "command", commandId: "new-socket", revision: before!.revision, command: { type: "leave-room" } }));
    expect(store.getRoom("ABCDEF")).toBeNull();
  });

  test.each(["during authentication", "after authentication"])("contains send and close failures %s and releases the binding once", (when) => {
    const { store, host, transport, session, authenticate } = fixture();
    if (when === "after authentication") authenticate();
    let sends = 0;
    let closes = 0;
    transport.send = () => { sends++; throw new Error(host.token); };
    transport.close = () => { closes++; session.onClose(); throw new Error(host.token); };
    expect(() => when === "during authentication" ? authenticate() : session.onMessage("invalid")).not.toThrow();
    const after = store.getRoom("ABCDEF");
    expect(after).toMatchObject({ revision: 2, players: [{ online: false, reconnectDeadline: 51_000 }] });
    authenticate();
    session.onClose();
    expect(store.getRoom("ABCDEF")).toEqual(after);
    expect(sends).toBe(1);
    expect(closes).toBe(1);
  });

  test.each(["connect", "handleCommand", "disconnect"] as const)("contains unexpected %s errors without exposing credentials or exceptions", (operation) => {
    const { store, host } = fixture();
    const transport = peer();
    const controlled: RoomStore = { ...store, [operation]: () => { throw new Error(`${host.token} sensitive stack`); } };
    const session = createRealtimeSession(controlled, "ABCDEF", transport);
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => session.onMessage(JSON.stringify({ version: 1, type: "authenticate", token: host.token }))).not.toThrow();
      if (operation === "handleCommand") session.onMessage('{"version":1,"type":"command","commandId":"safe","revision":1,"command":{"type":"start-game"}}');
      if (operation === "disconnect") expect(() => session.onClose()).not.toThrow();
      else rejected(transport, "INTERNAL_ERROR", operation === "handleCommand" ? "safe" : undefined);
      expect(JSON.stringify({ messages: transport.messages, closes: transport.closes, logs: log.mock.calls })).not.toContain(host.token);
      expect(JSON.stringify(log.mock.calls)).not.toContain("sensitive stack");
    } finally { log.mockRestore(); }
  });
});

function routeFixture(allowedOrigins = ["http://localhost:5173"]) {
  const room = fixture();
  const app = createApp({ port: 3000, corsOrigins: allowedOrigins }, { roomStore: room.store });
  const upgrades: { request: Request; data: BunWebSocketData }[] = [];
  const server = { upgrade(request: Request, options: { data: BunWebSocketData }) { upgrades.push({ request, data: options.data }); return true; } };
  const request = (origin?: string, path = "/api/rooms/ABCDEF/socket", upgrade = "websocket") => app.request(path, {
    headers: { ...(origin === undefined ? {} : { Origin: origin }), Upgrade: upgrade },
  }, server);
  return { ...room, app, server, upgrades, request };
}

describe("realtime HTTP upgrade boundary", () => {
  // Break caught: origin checks accept prefixes/substrings, credentials or opaque origins.
  test.each([
    undefined, "null", "https://untrusted.example", "http://localhost:5173.evil.example",
    "http://localhost:5174", "https://localhost:5173", "http://localhost:5173@evil.example",
    "http://evil.example/?origin=http://localhost:5173", "http://localhost:5173/path",
    "http://localhost:5173#fragment", "http://localhost:5173?query", "http://localhost:5173, https://evil.example",
  ])("rejects origin %s with 403 before upgrade or room mutation", async (origin) => {
    const { store, upgrades, request } = routeFixture();
    const before = store.getRoom("ABCDEF");
    const response = await request(origin);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: { code: "ORIGIN_NOT_ALLOWED", message: expect.any(String) } });
    expect(upgrades).toHaveLength(0);
    expect(store.getRoom("ABCDEF")).toEqual(before);
  });

  test.each(["http://localhost:5173", "HTTP://LOCALHOST:5173/", "https://game.example", "https://GAME.EXAMPLE:443/"])(
    "upgrades configured normalized origin %s", async (origin) => {
      const { upgrades, request } = routeFixture(["HTTP://LOCALHOST:5173/", "https://game.example:443/"]);
      expect((await request(origin)).status).toBe(200); // Bun owns the actual 101 response after upgrade().
      expect(upgrades).toHaveLength(1);
    },
  );

  test("does not treat wildcard, invalid or non-browser configured URLs as trusted origins", async () => {
    const { request, upgrades } = routeFixture(["*", "null", "file:///", "https://game.example/private", "https://user@game.example"]);
    expect((await request("https://game.example")).status).toBe(403);
    expect(upgrades).toHaveLength(0);
  });

  test.each(["bad", "ABCDEF7", "ABC0EF", "%2F", "%ZZ", "%20ABCDEF%20"])("rejects malformed room code %s before upgrading", async (code) => {
    const { request, upgrades } = routeFixture();
    const response = await request("http://localhost:5173", `/api/rooms/${code}/socket`);
    expect(response.status).toBe(404);
    expect(upgrades).toHaveLength(0);
  });

  test.each(["abcdef", "%61bcdef"])("binds exactly the decoded room code %s and serializes safe server messages", async (code) => {
    const { store, host, upgrades, request } = routeFixture();
    await request("http://localhost:5173", `/api/rooms/${code}/socket?source=browser`);
    const sent: string[] = [];
    const socket = { data: upgrades[0]!.data, readyState: 1 as const, send(data: string | ArrayBuffer | Uint8Array) { expect(typeof data).toBe("string"); sent.push(data as string); }, close() {} };
    websocket.open(socket);
    websocket.message(socket, JSON.stringify({ version: 1, type: "authenticate", token: host.token }));
    const latest = JSON.parse(sent.at(-1)!);
    expect(latest).toMatchObject({ version: 1, type: "snapshot", snapshot: { roomCode: "ABCDEF", viewerId: host.playerId } });
    expect(sent.join("")).not.toContain(host.token);
    const before = store.getRoom("ABCDEF");
    websocket.message(socket, { buffer: new ArrayBuffer(0) });
    expect(JSON.parse(sent.at(-1)!)).toMatchObject({ version: 1, type: "rejection", code: "INVALID_MESSAGE" });
    expect(store.getRoom("ABCDEF")).toEqual(before);
    websocket.close(socket, 1006, "network lost");
    expect(store.getRoom("ABCDEF")?.players[0]).toMatchObject({ online: false, reconnectDeadline: 51_000 });
  });

  test.each(["", "not-websocket"])("rejects missing or invalid Upgrade header %s with a safe HTTP response", async (upgrade) => {
    const { request, upgrades } = routeFixture();
    expect((await request("http://localhost:5173", undefined, upgrade)).status).toBe(426);
    expect(upgrades).toHaveLength(0);
  });

  test.each(["/api/rooms/ABCDEF/socket/", "/api/rooms/ABCDEF/socket/extra", "/api/Rooms/ABCDEF/socket", "/api/rooms/socket"])(
    "does not upgrade a nonmatching socket path %s", async (path) => {
      const { request, upgrades } = routeFixture();
      expect((await request("http://localhost:5173", path)).status).toBe(404);
      expect(upgrades).toHaveLength(0);
    },
  );

  test("contains upgrade exceptions and preserves safe REST errors and CORS", async () => {
    const { app, host } = routeFixture();
    const log = spyOn(console, "error").mockImplementation(() => {});
    try {
      const response = await app.request("/api/rooms/ABCDEF/socket", { headers: { Origin: "http://localhost:5173", Upgrade: "websocket" } }, {
        upgrade() { throw new Error(host.token); },
      });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: { code: "INTERNAL_ERROR", message: expect.any(String) } });
      expect(JSON.stringify(log.mock.calls)).not.toContain(host.token);
      const health = await app.request("/api/health", { headers: { Origin: "http://localhost:5173" } });
      expect(health.status).toBe(200);
      expect(health.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    } finally { log.mockRestore(); }
  });
});
