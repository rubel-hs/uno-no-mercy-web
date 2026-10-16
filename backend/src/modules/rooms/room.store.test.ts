import { describe, expect, test } from "bun:test";
import { createDeck } from "../game/deck";
import type { ClientCommand, ClientEnvelope, PlayerSnapshot, ServerMessage } from "../game/game.protocol";
import type { PhysicalCard } from "../game/game.types";
import { AcceptedCommandHistory, createRoomStore } from "./room.store";
import type { RoomCredentials, RoomPeer, RoomResult, RoomStoreDeps } from "./room.types";

class FakeClock {
  time = 1_000;
  private nextId = 0;
  readonly timers = new Map<number, { at: number; callback: () => void }>();
  now = () => this.time;
  setTimeout = (callback: () => void, delay: number) => {
    const id = ++this.nextId;
    this.timers.set(id, { at: this.time + delay, callback });
    return id;
  };
  clearTimeout = (id: unknown) => { this.timers.delete(id as number); };
  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
      if (!next) break;
      this.time = next[1].at;
      this.timers.delete(next[0]);
      next[1].callback();
    }
    this.time = end;
  }
}

function peer(id: string, onClose?: () => void) {
  const messages: ServerMessage[] = [];
  const closes: { code?: number; reason?: string }[] = [];
  return {
    id, messages, closes,
    send(message: ServerMessage) { messages.push(structuredClone(message)); },
    close(code?: number, reason?: string) { closes.push({ code, reason }); onClose?.(); },
  } satisfies RoomPeer & { messages: ServerMessage[]; closes: { code?: number; reason?: string }[] };
}

function value<T>(result: RoomResult<T>): T {
  if (!result.ok) throw new Error(`Expected success, received ${result.code}`);
  return result.value;
}

function envelope(command: ClientCommand, revision: number, commandId = "command"): ClientEnvelope {
  return { version: 1, type: "command", commandId, revision, command };
}

function latest(connection: ReturnType<typeof peer>): PlayerSnapshot {
  const message = connection.messages.filter((message) => message.type === "snapshot").at(-1);
  if (!message || message.type !== "snapshot") throw new Error("Expected snapshot");
  return message.snapshot;
}

function harness(overrides: Partial<RoomStoreDeps> = {}) {
  const clock = new FakeClock();
  let codes = 0;
  let tokens = 0;
  let cards = 0;
  const store = createRoomStore({
    now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout,
    roomCodeFactory: () => ["ABCDEF", "GHJKLM", "NPQRST"][codes++]!,
    tokenFactory: () => `secret-token-${++tokens}`,
    cardIdFactory: () => `card-${++cards}`,
    random: () => 0.999999,
    ...overrides,
  });
  return { store, clock };
}

// Real canonical cards + a Fisher-Yates random stream arrange actual engine deals.
// No room internals or engine transitions are replaced or mutated by the fixtures.
function dealRandom(hands: string[][], top = "red-5", dealerIndex = hands.length - 1): () => number {
  let id = 0;
  const original = createDeck(() => `card-${++id}`);
  const remaining = [...original];
  const take = (faceId: string) => {
    const index = remaining.findIndex((card) => card.faceId === faceId);
    if (index < 0) throw new Error(`Fixture exhausted ${faceId}`);
    return remaining.splice(index, 1)[0]!;
  };
  const desired: PhysicalCard[] = [];
  for (let round = 0; round < 7; round++) for (let offset = 1; offset <= hands.length; offset++) {
    desired.push(take(hands[(dealerIndex + offset) % hands.length]![round]!));
  }
  desired.push(take(top), ...remaining);
  const shuffled = [...original];
  const samples: number[] = [];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = shuffled.findIndex((card) => card.instanceId === desired[i]!.instanceId);
    samples.push((j + 0.5) / (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  samples.push((dealerIndex + 0.5) / hands.length);
  return () => samples.shift() ?? 0.999999;
}

function roundDeals(deals: { hands: string[][]; dealerIndex: number }[]): () => number {
  const samples = deals.flatMap(({ hands, dealerIndex }, index) => {
    const random = dealRandom(hands, "red-5", dealerIndex);
    // Only the first round chooses a random dealer; subsequent rounds rotate.
    return Array.from({ length: index === 0 ? 168 : 167 }, random);
  });
  return () => {
    const sample = samples.shift();
    if (sample === undefined) throw new Error("Unexpected round/dealer random sample");
    return sample;
  };
}

const defaultHands = [
  ["red-draw-4", "red-1", "red-2", "red-3", "red-4", "red-8", "red-9"],
  ["wild-draw-6", "blue-1", "blue-2", "blue-3", "blue-4", "blue-8", "blue-9"],
  ["green-draw-4", "green-1", "green-2", "green-3", "green-4", "green-8", "green-9"],
  ["yellow-draw-4", "yellow-1", "yellow-2", "yellow-3", "yellow-4", "yellow-8", "yellow-9"],
  ["red-draw-2", "red-1", "red-2", "red-3", "red-4", "red-8", "red-9"],
  ["blue-draw-2", "blue-1", "blue-2", "blue-3", "blue-4", "blue-8", "blue-9"],
];

function lobby(count = 3, overrides: Partial<RoomStoreDeps> = {}) {
  const { store, clock } = harness(overrides);
  const seats: RoomCredentials[] = [value(store.createRoom("Alice"))];
  for (let i = 1; i < count; i++) seats.push(value(store.joinRoom(seats[0]!.roomCode, ["Bob", "Carol", "Dan", "Eve", "Finn"][i - 1]!)));
  const peers = seats.map((seat, index) => {
    const connection = peer(`peer-${index}`);
    expect(value(store.connect(seat.roomCode, seat.token, connection)).playerId).toBe(seat.playerId);
    return connection;
  });
  const roomCode = seats[0]!.roomCode;
  let commandId = 0;
  const command = (index: number, command: ClientCommand, id = `cmd-${++commandId}`) =>
    store.handleCommand(roomCode, seats[index]!.playerId, envelope(command, store.getRoom(roomCode)!.revision, id));
  return { store, clock, seats, peers, roomCode, command };
}

function game(hands = defaultHands.slice(0, 3), overrides: Partial<RoomStoreDeps> = {}) {
  const result = lobby(hands.length, { random: dealRandom(hands), ...overrides });
  value(result.command(0, { type: "start-game" }));
  const state = () => result.store.getRoom(result.roomCode)!.game!;
  const play = (index: number, faceId: string, id?: string) => {
    const card = state().players[index]!.hand.find((card) => card.faceId === faceId);
    if (!card) throw new Error(`No ${faceId} in seat ${index}`);
    return result.command(index, { type: "play-card", cardId: card.instanceId }, id);
  };
  return { ...result, state, play };
}

function expiryWinner(delivery: "timely" | "delayed-settlement" | "delayed-timer", gap: number) {
  const hands = defaultHands.slice(0, 3).map((hand) => [...hand]);
  hands[0]![0] = "wild-draw-10";
  hands[1]![0] = "wild-draw-10";
  const room = game(hands);
  value(room.play(0, "wild-draw-10"));
  value(room.command(0, { type: "choose-color", color: "red" }));
  value(room.play(1, "wild-draw-10"));
  value(room.command(1, { type: "choose-color", color: "blue" }));
  value(room.command(2, { type: "accept-draw" }));
  // Carol remains connected after a real +20 penalty Mercy-eliminates her.
  expect(room.state().players.map(({ eliminated }) => eliminated)).toEqual([false, false, true]);
  expect(room.state().phase).toBe("playing");
  room.store.disconnect(room.roomCode, room.seats[1]!.playerId, room.peers[1]!.id);
  room.clock.advance(gap);
  room.store.disconnect(room.roomCode, room.seats[0]!.playerId, room.peers[0]!.id);
  const callbacks = [...room.clock.timers.values()].map(({ callback }) => callback);
  if (delivery === "timely") room.clock.advance(50_000);
  else {
    room.clock.time += 50_000;
    // Deliver Alice's later-created callback first to exercise timer-side ordering.
    if (delivery === "delayed-timer") callbacks[1]!();
  }
  const replacement = peer("carol-reconnected");
  value(room.store.connect(room.roomCode, room.seats[2]!.token, replacement));
  const result = room.state();
  // Drained callbacks must stay inert after another path has removed their seats.
  for (const callback of callbacks) callback();
  expect(room.state()).toEqual(result);
  expect(room.clock.timers.size).toBe(0);
  return {
    winner: result.players.find(({ id }) => id === result.winner)!.name,
    revision: result.revision,
    eliminated: result.players.map(({ eliminated }) => eliminated),
    retainedNames: room.store.getRoom(room.roomCode)!.players.map(({ name }) => name),
  };
}

describe("room creation and lobby", () => {
  // Break caught: collisions overwrite rooms/seats or private credentials are reused.
  test("retries room code and token collisions without overwriting existing rooms", () => {
    const codes = ["ABCDEF", "ABCDEF", "GHJKLM"];
    const tokens = ["one", "one", "two", "two", "three"];
    const { store } = harness({ roomCodeFactory: () => codes.shift()!, tokenFactory: () => tokens.shift()! });
    const first = value(store.createRoom(" Alice "));
    const second = value(store.createRoom("Bob"));
    const third = value(store.joinRoom(first.roomCode, "Carol"));
    expect([first.roomCode, second.roomCode]).toEqual(["ABCDEF", "GHJKLM"]);
    expect([first.token, second.token, third.token]).toEqual(["one", "two", "three"]);
    expect(new Set([first.playerId, second.playerId, third.playerId]).size).toBe(3);
    expect(store.getRoom(first.roomCode)!.players.map(({ name }) => name)).toEqual(["Alice", "Carol"]);
  });

  // Break caught: default identifiers contain ambiguous symbols or insufficient secret entropy.
  test("production credentials use six unambiguous symbols and 32-byte base64url tokens", () => {
    const clock = new FakeClock();
    const store = createRoomStore({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
    const credentials = value(store.createRoom("Alice"));
    expect(credentials.roomCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(credentials.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(credentials.token, "base64url")).toHaveLength(32);
  });

  // Break caught: malformed input throws, mutates membership, or bypasses trimmed/case-folded uniqueness.
  test("validates names and normalized duplicates before room mutation", () => {
    const { store } = harness();
    for (const name of ["", " \t\n", "x".repeat(25), null, {}, 7]) expect(store.createRoom(name)).toMatchObject({ ok: false, code: "INVALID_NAME" });
    const host = value(store.createRoom(" Alice "));
    for (const name of ["alice", " ALICE "]) expect(store.joinRoom(" abcdef ", name)).toMatchObject({ ok: false, code: "DUPLICATE_NAME" });
    for (const name of ["", "x".repeat(25), null]) expect(store.joinRoom(host.roomCode, name)).toMatchObject({ ok: false, code: "INVALID_NAME" });
    expect(value(store.joinRoom(" abcdef ", "x".repeat(24))).roomCode).toBe("ABCDEF");
    expect(store.getRoom(host.roomCode)!.players).toHaveLength(2);
    for (const code of ["NOPE", "ABC0EF", null, {}]) expect(store.joinRoom(code, "Bob")).toMatchObject({ ok: false, code: "ROOM_NOT_FOUND" });
  });

  test("host alone cannot start, non-host cannot start, and six is the seat limit", () => {
    const room = lobby(1);
    expect(room.command(0, { type: "start-game" })).toMatchObject({ ok: false, code: "NOT_ENOUGH_PLAYERS" });
    const second = value(room.store.joinRoom(room.roomCode, "Bob"));
    expect(room.store.handleCommand(room.roomCode, second.playerId, envelope({ type: "start-game" }, room.store.getRoom(room.roomCode)!.revision))).toMatchObject({ ok: false, code: "NOT_HOST" });
    for (const name of ["Carol", "Dan", "Eve", "Finn"]) value(room.store.joinRoom(room.roomCode, name));
    expect(room.store.joinRoom(room.roomCode, "Grace")).toMatchObject({ ok: false, code: "ROOM_FULL" });
    value(room.command(0, { type: "start-game" }));
    expect(room.store.getRoom(room.roomCode)!.game!.players.map(({ hand }) => hand.length)).toEqual([7, 7, 7, 7, 7, 7]);
    expect(room.store.joinRoom(room.roomCode, "Grace")).toMatchObject({ ok: false, code: "ROOM_STARTED" });
  });

  test("intentional lobby leave transfers host and immediately deletes the empty room", () => {
    const room = lobby(2);
    value(room.command(0, { type: "leave-room" }));
    expect(room.store.getRoom(room.roomCode)!.hostPlayerId).toBe(room.seats[1]!.playerId);
    expect(latest(room.peers[1]!).allowedControls).not.toContain("start-game");
    value(room.command(1, { type: "leave-room" }));
    expect(room.store.getRoom(room.roomCode)).toBeNull();
    expect(room.clock.timers.size).toBe(0);
    expect(room.peers.map(({ closes }) => closes.length)).toEqual([1, 1]);
    expect(room.store.connect(room.roomCode, room.seats[0]!.token, peer("late"))).toMatchObject({ ok: false, code: "ROOM_NOT_FOUND" });
  });

  // Break caught: abandoned REST-only seats leak, or host authority is stranded after their deadline.
  test("initial connection grace removes abandoned seats and transfers host at 50 seconds", () => {
    const { store, clock } = harness();
    const first = value(store.createRoom("Alice"));
    clock.advance(1_000);
    const second = value(store.joinRoom(first.roomCode, "Bob"));
    clock.advance(48_999);
    expect(store.getRoom(first.roomCode)!.players).toHaveLength(2);
    clock.advance(1);
    expect(store.getRoom(first.roomCode)!.hostPlayerId).toBe(second.playerId);
    expect(store.getRoom(first.roomCode)!.players).toHaveLength(1);
    clock.advance(1_000);
    expect(store.getRoom(first.roomCode)).toBeNull();
    expect(clock.timers.size).toBe(0);
  });

  test("connecting before the initial deadline cancels that seat's expiry", () => {
    const { store, clock } = harness();
    const seat = value(store.createRoom("Alice"));
    clock.advance(49_999);
    value(store.connect(seat.roomCode, seat.token, peer("first")));
    clock.advance(100_000);
    expect(store.getRoom(seat.roomCode)!.players).toHaveLength(1);
    expect(clock.timers.size).toBe(0);
  });
});

const winningHand = ["red-discard-all", "red-1", "red-2", "red-3", "red-4", "red-8", "red-9"];
const scoringHands = [winningHand, defaultHands[1]!, defaultHands[2]!];

describe("room-owned match lifecycle", () => {
  test("creates zeroed lobby scores for every seat and returns detached match inspection", () => {
    const room = lobby(1);
    const hostId = room.seats[0]!.playerId;
    expect(room.store.getRoom(room.roomCode)!.match).toEqual({
      status: "lobby", roundNumber: 0, targetScore: 1000, scoresByPlayerId: { [hostId]: 0 },
      lastRoundResult: null, winner: null, finalizedRoundNumber: null, dealerIndex: 0,
    });
    const guest = value(room.store.joinRoom(room.roomCode, "Bob"));
    const copy = room.store.getRoom(room.roomCode)!;
    expect(copy.match.scoresByPlayerId).toEqual({ [hostId]: 0, [guest.playerId]: 0 });
    copy.match.scoresByPlayerId[hostId] = 999;
    copy.match.roundNumber = 42;
    expect(room.store.getRoom(room.roomCode)!.match).toMatchObject({
      roundNumber: 0, scoresByPlayerId: { [hostId]: 0, [guest.playerId]: 0 },
    });
  });

  test.each([0, 1, 2])("starts round one with randomized dealer %i and a complete fresh deck", (dealerIndex) => {
    const room = lobby(3, { random: dealRandom(scoringHands, "red-5", dealerIndex) });
    const before = room.store.getRoom(room.roomCode)!;
    value(room.command(0, { type: "start-game" }));
    const after = room.store.getRoom(room.roomCode)!;
    expect(after.match).toEqual({
      status: "round-active", roundNumber: 1, targetScore: 1000,
      scoresByPlayerId: Object.fromEntries(room.seats.map(({ playerId }) => [playerId, 0])),
      lastRoundResult: null, winner: null, finalizedRoundNumber: null, dealerIndex,
    });
    expect(after.revision).toBe(before.revision + 1);
    expect(after.game).toMatchObject({ revision: after.revision, currentPlayerId: room.seats[(dealerIndex + 1) % 3]!.playerId });
    expect(after.game!.players.map(({ hand }) => hand.map(({ faceId }) => faceId))).toEqual(scoringHands);
    const cards = [...after.game!.drawPile, ...after.game!.discardPile, ...after.game!.players.flatMap(({ hand }) => hand)];
    expect(cards).toHaveLength(168);
    expect(new Set(cards.map(({ instanceId }) => instanceId)).size).toBe(168);
  });

  test("finalizes a winning play with exact scores in the same room revision", () => {
    const room = game(scoringHands);
    const before = room.state().revision;
    value(room.play(0, "red-discard-all"));
    const after = room.store.getRoom(room.roomCode)!;
    const alice = room.seats[0]!.playerId;
    const bob = room.seats[1]!.playerId;
    const carol = room.seats[2]!.playerId;
    // Bob: 50 + 1 + 2 + 3 + 4 + 8 + 9 = 77; Carol: 20 + 27 = 47.
    expect(after.match).toEqual({
      status: "round-complete", roundNumber: 1, targetScore: 1000, dealerIndex: 2,
      finalizedRoundNumber: 1, winner: null, scoresByPlayerId: { [alice]: 124, [bob]: 0, [carol]: 0 },
      lastRoundResult: {
        roundNumber: 1, winnerId: alice, matchWinnerId: null,
        breakdown: [
          { playerId: alice, cardPoints: 124, eliminationBonus: 0, roundPoints: 124, cumulativePoints: 124 },
          { playerId: bob, cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 0 },
          { playerId: carol, cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 0 },
        ],
      },
    });
    expect(after.revision).toBe(before + 1);
    expect(after.game).toMatchObject({ phase: "finished", winner: alice, revision: after.revision });
  });

  test("retries, reconnects, inspection and departures cannot finalize the same round twice", () => {
    const room = game(scoringHands);
    const message = envelope({ type: "play-card", cardId: room.state().players[0]!.hand[0]!.instanceId }, room.state().revision, "finish-once");
    value(room.store.handleCommand(room.roomCode, room.seats[0]!.playerId, message));
    const completed = room.store.getRoom(room.roomCode)!;
    expect(completed.match).toMatchObject({ finalizedRoundNumber: 1, scoresByPlayerId: { [room.seats[0]!.playerId]: 124 } });
    expect(room.store.handleCommand(room.roomCode, room.seats[0]!.playerId, message)).toMatchObject({ ok: false, code: "DUPLICATE_COMMAND" });
    expect(room.command(0, message.command)).toMatchObject({ ok: false, code: "invalid-phase" });
    expect(room.store.getRoom(room.roomCode)).toEqual(completed);
    room.store.disconnect(room.roomCode, room.seats[0]!.playerId, room.peers[0]!.id);
    value(room.store.connect(room.roomCode, room.seats[0]!.token, peer("round-result-reconnect")));
    value(room.command(1, { type: "leave-room" }));
    expect(room.store.getRoom(room.roomCode)!.match).toEqual(completed.match);
    completed.match.lastRoundResult!.breakdown[0]!.cumulativePoints = 999;
    expect(room.store.getRoom(room.roomCode)!.match.lastRoundResult!.breakdown[0]!.cumulativePoints).toBe(124);
  });

  test("rejects every gameplay command while the round result is waiting", () => {
    const room = game(scoringHands);
    value(room.play(0, "red-discard-all"));
    const before = room.store.getRoom(room.roomCode)!;
    expect(before.match).toMatchObject({ status: "round-complete" });
    const commands: ClientCommand[] = [
      { type: "play-card", cardId: "old-card" }, { type: "draw-until-playable" }, { type: "draw-and-pass" },
      { type: "accept-draw" }, { type: "choose-color", color: "red" },
      { type: "choose-swap-target", targetPlayerId: room.seats[1]!.playerId },
      { type: "choose-roulette-color", color: "blue" }, { type: "declare-uno" },
      { type: "catch-uno", targetPlayerId: room.seats[1]!.playerId },
    ];
    for (const command of commands) expect(room.command(0, command)).toMatchObject({ ok: false, code: "invalid-phase" });
    expect(room.store.getRoom(room.roomCode)).toEqual(before);
  });

  test("only the host starts the next round, committing one revision and one snapshot per peer", () => {
    const room = game(scoringHands);
    value(room.play(0, "red-discard-all"));
    const before = room.store.getRoom(room.roomCode)!;
    expect(room.command(1, { type: "start-next-round" }, "next")).toMatchObject({ ok: false, code: "NOT_HOST" });
    expect(room.store.getRoom(room.roomCode)).toEqual(before);
    const counts = room.peers.map(({ messages }) => messages.length);
    expect(value(room.command(0, { type: "start-next-round" }, "next"))).toEqual({ revision: before.revision + 1 });
    expect(room.store.getRoom(room.roomCode)!.match).toMatchObject({ status: "round-active", roundNumber: 2 });
    room.peers.forEach((connection, index) => {
      expect(connection.messages).toHaveLength(counts[index]! + 1);
      expect(latest(connection).revision).toBe(before.revision + 1);
    });
  });

  test.each(["lobby", "round-active"] as const)("rejects next-round in %s without consuming the command ID", (status) => {
    const room = lobby(3, { random: dealRandom(scoringHands) });
    if (status === "round-active") value(room.command(0, { type: "start-game" }));
    const before = room.store.getRoom(room.roomCode)!;
    expect(before.match).toMatchObject({ status });
    expect(room.command(0, { type: "start-next-round" }, "retry-next")).toMatchObject({ ok: false, code: "round-not-complete" });
    expect(room.store.getRoom(room.roomCode)).toEqual(before);
    if (status === "lobby") value(room.command(0, { type: "start-game" }));
    value(room.command(0, { type: "play-card", cardId: room.store.getRoom(room.roomCode)!.game!.players[0]!.hand[0]!.instanceId }));
    value(room.command(0, { type: "start-next-round" }, "retry-next"));
  });

  test("rotates the dealer, replaces all physical cards, and carries scores and results into later rounds", () => {
    const secondHands = [defaultHands[1]!, winningHand, defaultHands[2]!];
    const room = game(scoringHands, { random: roundDeals([
      { hands: scoringHands, dealerIndex: 2 }, { hands: secondHands, dealerIndex: 0 },
    ]) });
    const firstGame = room.state();
    const oldIds = new Set([...firstGame.drawPile, ...firstGame.discardPile, ...firstGame.players.flatMap(({ hand }) => hand)].map(({ instanceId }) => instanceId));
    value(room.play(0, "red-discard-all"));
    const completed = room.store.getRoom(room.roomCode)!.match;
    value(room.command(0, { type: "start-next-round" }));
    const next = room.store.getRoom(room.roomCode)!;
    expect(next.match).toEqual({ ...completed, status: "round-active", roundNumber: 2, dealerIndex: 0 });
    expect(next.game).toMatchObject({
      phase: "playing", direction: 1, currentPlayerId: room.seats[1]!.playerId,
      revision: next.revision, gameplaySequence: 0, pendingChoice: null, drawStack: null, unoWindow: null, winner: null,
    });
    expect(next.game!.players.map(({ hand }) => hand.map(({ faceId }) => faceId))).toEqual(secondHands);
    const cards = [...next.game!.drawPile, ...next.game!.discardPile, ...next.game!.players.flatMap(({ hand }) => hand)];
    expect(cards).toHaveLength(168);
    expect(new Set(cards.map(({ instanceId }) => instanceId)).size).toBe(168);
    expect(cards.some(({ instanceId }) => oldIds.has(instanceId))).toBe(false);
    value(room.play(1, "red-discard-all"));
    expect(room.store.getRoom(room.roomCode)!.match).toMatchObject({
      status: "round-complete", roundNumber: 2, finalizedRoundNumber: 2,
      scoresByPlayerId: { [room.seats[0]!.playerId]: 124, [room.seats[1]!.playerId]: 124, [room.seats[2]!.playerId]: 0 },
      lastRoundResult: { roundNumber: 2, winnerId: room.seats[1]!.playerId },
    });
  });

  test("carries multi-round match progression to match-complete at the target score", () => {
    const round1Hands = [
      winningHand,
      ["wild-draw-6", "blue-1", "blue-2", "blue-3", "blue-4", "blue-8", "blue-9"],
      ["green-draw-4", "green-1", "green-2", "green-3", "green-4", "green-8", "green-9"],
      ["yellow-draw-4", "yellow-1", "yellow-2", "yellow-3", "yellow-4", "yellow-8", "yellow-9"],
    ];
    const round2Hands = [
      Array(7).fill("wild-reverse-draw-4"),
      winningHand,
      Array(7).fill("wild-color-roulette"),
      ["wild-reverse-draw-4", "wild-color-roulette", "wild-draw-6", "wild-draw-6", "wild-draw-6", "wild-draw-6", "wild-draw-10"],
    ];
    const room = game(round1Hands, {
      random: roundDeals([
        { hands: round1Hands, dealerIndex: 3 },
        { hands: round2Hands, dealerIndex: 0 },
      ]),
    });
    value(room.play(0, "red-discard-all"));
    const round1Match = room.store.getRoom(room.roomCode)!.match;
    expect(round1Match).toMatchObject({
      status: "round-complete",
      roundNumber: 1,
      scoresByPlayerId: { [room.seats[0]!.playerId]: 171 },
      winner: null,
      lastRoundResult: { roundNumber: 1, winnerId: room.seats[0]!.playerId, matchWinnerId: null },
    });

    value(room.command(0, { type: "start-next-round" }));
    expect(room.store.getRoom(room.roomCode)!.match).toMatchObject({
      status: "round-active",
      roundNumber: 2,
      dealerIndex: 0,
      scoresByPlayerId: { [room.seats[0]!.playerId]: 171 },
    });

    value(room.play(1, "red-discard-all"));
    const finalMatch = room.store.getRoom(room.roomCode)!.match;
    expect(finalMatch).toMatchObject({
      status: "match-complete",
      roundNumber: 2,
      winner: room.seats[1]!.playerId,
      scoresByPlayerId: { [room.seats[0]!.playerId]: 171, [room.seats[1]!.playerId]: 1050 },
      lastRoundResult: { roundNumber: 2, winnerId: room.seats[1]!.playerId, matchWinnerId: room.seats[1]!.playerId },
    });
    expect(room.command(0, { type: "start-next-round" })).toMatchObject({ ok: false, code: "match-complete" });
  });

  test("stale and duplicate next-round commands never redeal, rotate or change scores", () => {
    const room = game(scoringHands);
    value(room.play(0, "red-discard-all"));
    const before = room.store.getRoom(room.roomCode)!;
    const message = envelope({ type: "start-next-round" }, before.revision, "next-once");
    const send = (input: ClientEnvelope) => room.store.handleCommand(room.roomCode, room.seats[0]!.playerId, input);
    expect(send({ ...message, revision: before.revision - 1 })).toMatchObject({ ok: false, code: "STALE_REVISION" });
    expect(room.store.getRoom(room.roomCode)).toEqual(before);
    value(send(message));
    const after = room.store.getRoom(room.roomCode)!;
    expect(after.match).toEqual({ ...before.match, status: "round-active", roundNumber: 2, dealerIndex: 0 });
    expect(send(message)).toMatchObject({ ok: false, code: "DUPLICATE_COMMAND" });
    expect(send({ ...message, revision: after.revision })).toMatchObject({ ok: false, code: "DUPLICATE_COMMAND" });
    expect(send({ ...message, commandId: "competing-next" })).toMatchObject({ ok: false, code: "STALE_REVISION" });
    expect(room.store.getRoom(room.roomCode)).toEqual(after);
  });

  test("ends the match at the target and preserves the final winner after departures", () => {
    const hands = [winningHand, Array(7).fill("wild-reverse-draw-4"), Array(7).fill("wild-color-roulette"),
      ["wild-reverse-draw-4", "wild-color-roulette", "wild-draw-6", "wild-draw-6", "wild-draw-6", "wild-draw-6", "wild-draw-10"]];
    const room = game(hands);
    value(room.play(0, "red-discard-all"));
    const before = room.store.getRoom(room.roomCode)!;
    const winnerId = room.seats[0]!.playerId;
    expect(before.match).toMatchObject({
      status: "match-complete", winner: winnerId, finalizedRoundNumber: 1,
      scoresByPlayerId: { [winnerId]: 1050 }, lastRoundResult: { matchWinnerId: winnerId },
    });
    expect(room.command(0, { type: "start-next-round" })).toMatchObject({ ok: false, code: "match-complete" });
    expect(room.command(1, { type: "start-next-round" })).toMatchObject({ ok: false, code: "NOT_HOST" });
    expect(room.command(0, { type: "draw-and-pass" })).toMatchObject({ ok: false, code: "invalid-phase" });
    expect(room.store.getRoom(room.roomCode)).toEqual(before);
    value(room.command(0, { type: "leave-room" }));
    expect(room.command(1, { type: "start-next-round" })).toMatchObject({ ok: false, code: "match-complete" });
    expect(room.store.getRoom(room.roomCode)!.match).toEqual(before.match);
  });

  test.each(["leave", "expire"] as const)("%s between rounds transfers host, excludes that seat, and keeps historical points", (mode) => {
    const room = game(scoringHands);
    value(room.play(0, "red-discard-all"));
    const completed = room.store.getRoom(room.roomCode)!.match;
    if (mode === "leave") value(room.command(0, { type: "leave-room" }));
    else {
      room.store.disconnect(room.roomCode, room.seats[0]!.playerId, room.peers[0]!.id);
      room.clock.advance(50_000);
    }
    expect(room.store.getRoom(room.roomCode)!.hostPlayerId).toBe(room.seats[1]!.playerId);
    expect(room.store.getRoom(room.roomCode)!.match).toEqual(completed);
    value(room.command(1, { type: "start-next-round" }));
    const next = room.store.getRoom(room.roomCode)!;
    expect(next.game!.players.map(({ id }) => id)).toEqual([room.seats[1]!.playerId, room.seats[2]!.playerId]);
    expect(next.game!.players.map(({ hand }) => hand.length)).toEqual([7, 7]);
    expect(next.match).toMatchObject({ scoresByPlayerId: { [room.seats[0]!.playerId]: 124 }, lastRoundResult: completed.lastRoundResult });
  });

  test.each(["leave", "expire"] as const)("%s during a round transfers next-round authority without awarding departure points", (mode) => {
    const room = game([defaultHands[1]!, winningHand, defaultHands[2]!]);
    if (mode === "leave") value(room.command(0, { type: "leave-room" }));
    else {
      room.store.disconnect(room.roomCode, room.seats[0]!.playerId, room.peers[0]!.id);
      room.clock.advance(50_000);
    }
    expect(room.store.getRoom(room.roomCode)!.hostPlayerId).toBe(room.seats[1]!.playerId);
    value(room.play(1, "red-discard-all"));
    expect(room.store.getRoom(room.roomCode)!.match).toMatchObject({
      status: "round-complete", scoresByPlayerId: { [room.seats[0]!.playerId]: 0, [room.seats[1]!.playerId]: 47 },
      lastRoundResult: { breakdown: expect.arrayContaining([
        { playerId: room.seats[1]!.playerId, cardPoints: 47, eliminationBonus: 0, roundPoints: 47, cumulativePoints: 47 },
      ]) },
    });
    value(room.command(1, { type: "start-next-round" }));
  });

  test.each([
    { departed: [0], dealer: 2, index: 1 }, { departed: [1], dealer: 2, index: 1 },
    { departed: [2], dealer: 3, index: 2 }, { departed: [1, 2], dealer: 3, index: 1 },
    { departed: [2, 3], dealer: 0, index: 0 },
  ])("rotates to the next retained seat after departures $departed", ({ departed, dealer, index }) => {
    const hands = [defaultHands[1]!, defaultHands[2]!, winningHand, defaultHands[3]!];
    const room = game(hands, { random: dealRandom(hands, "red-5", 1) });
    value(room.play(2, "red-discard-all"));
    for (const seat of departed) value(room.command(seat, { type: "leave-room" }));
    const retained = room.store.getRoom(room.roomCode)!;
    const hostIndex = room.seats.findIndex(({ playerId }) => playerId === retained.hostPlayerId);
    value(room.command(hostIndex, { type: "start-next-round" }));
    const next = room.store.getRoom(room.roomCode)!;
    expect(next.match).toMatchObject({ roundNumber: 2, dealerIndex: index });
    expect(next.game!.players[index]!.id).toBe(room.seats[dealer]!.playerId);
    expect(next.game!.currentPlayerId).toBe(next.game!.players[(index + 1) % next.game!.players.length]!.id);
  });

  test.each(["leave", "expire"] as const)("%s finalizes last-player victory exactly once and cannot deal to a single seat", (mode) => {
    const room = game(defaultHands.slice(0, 2));
    if (mode === "leave") value(room.command(1, { type: "leave-room" }));
    else {
      room.store.disconnect(room.roomCode, room.seats[1]!.playerId, room.peers[1]!.id);
      room.clock.advance(50_000);
    }
    const before = room.store.getRoom(room.roomCode)!;
    expect(before.match).toMatchObject({
      status: "round-complete", finalizedRoundNumber: 1,
      scoresByPlayerId: { [room.seats[0]!.playerId]: 0, [room.seats[1]!.playerId]: 0 },
      lastRoundResult: { winnerId: room.seats[0]!.playerId },
    });
    expect(room.command(0, { type: "start-next-round" })).toMatchObject({ ok: false, code: "NOT_ENOUGH_PLAYERS" });
    expect(room.store.getRoom(room.roomCode)).toEqual(before);
  });

  test("a failed next-round deal keeps the result, revision and command ID retryable", () => {
    let fail = false;
    let cards = 0;
    const room = game(scoringHands, { cardIdFactory: () => {
      if (fail) throw new Error("Private card factory failure");
      return `card-${++cards}`;
    } });
    value(room.play(0, "red-discard-all"));
    const before = room.store.getRoom(room.roomCode)!;
    fail = true;
    expect(room.command(0, { type: "start-next-round" }, "retry-deal")).toEqual({
      ok: false, code: "INTERNAL_ERROR", message: "The request could not be completed.", revision: before.revision,
    });
    expect(room.store.getRoom(room.roomCode)).toEqual(before);
    fail = false;
    value(room.command(0, { type: "start-next-round" }, "retry-deal"));
    expect(room.store.getRoom(room.roomCode)!.match).toEqual({ ...before.match, status: "round-active", roundNumber: 2, dealerIndex: 0 });
  });
});

describe("command ordering and private views", () => {
  test("rejects invalid identity and malformed commands without changing the room", () => {
    const room = game();
    const before = room.store.getRoom(room.roomCode);
    expect(room.store.connect(room.roomCode, "wrong-token", peer("intruder"))).toMatchObject({ ok: false, code: "INVALID_TOKEN" });
    expect(room.store.handleCommand(room.roomCode, "intruder", envelope({ type: "leave-room" }, before!.revision))).toMatchObject({ ok: false, code: "PLAYER_NOT_FOUND" });
    expect(room.store.handleCommand(room.roomCode, room.seats[1]!.playerId, envelope({ type: "play-card", cardId: room.state().players[0]!.hand[0]!.instanceId, playerId: room.seats[0]!.playerId } as ClientCommand, before!.revision))).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
    for (const invalid of [null, "not JSON", {}, { ...envelope({ type: "leave-room" }, before!.revision), revision: -1 }]) {
      expect(room.store.handleCommand(room.roomCode, room.seats[0]!.playerId, invalid)).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
    }
    expect(room.store.getRoom(room.roomCode)).toEqual(before);
  });

  test("rejects duplicates before stale revisions and never applies an accepted play twice", () => {
    const room = game();
    const before = room.state();
    const message = envelope({ type: "play-card", cardId: before.players[0]!.hand.find(({ faceId }) => faceId === "red-1")!.instanceId }, before.revision, "once");
    value(room.store.handleCommand(room.roomCode, room.seats[0]!.playerId, message));
    expect(room.state().revision).toBe(before.revision + 1);
    expect(room.state().players[0]!.hand).toHaveLength(6);
    const after = room.state();
    expect(room.store.handleCommand(room.roomCode, room.seats[0]!.playerId, message)).toMatchObject({ ok: false, code: "DUPLICATE_COMMAND" });
    expect(room.store.handleCommand(room.roomCode, room.seats[1]!.playerId, { ...message, commandId: "fresh" })).toMatchObject({ ok: false, code: "STALE_REVISION", revision: after.revision });
    expect(room.state()).toEqual(after);
  });

  test("rejected commands do not poison IDs and each player's ID namespace is independent", () => {
    const room = lobby(2);
    expect(room.command(1, { type: "start-game" }, "retry")).toMatchObject({ ok: false, code: "NOT_HOST" });
    value(room.command(0, { type: "leave-room" }, "retry"));
    value(room.command(1, { type: "leave-room" }, "retry"));
    expect(room.store.getRoom(room.roomCode)).toBeNull();
  });

  // Break caught: using an unbounded or off-by-one history; rejections are never passed to remember.
  test("accepted history evicts exactly the oldest ID after 256 newer accepted commands", () => {
    const history = new AcceptedCommandHistory();
    for (let i = 0; i < 256; i++) history.add(`accepted-${i}`);
    expect(history.has("accepted-0")).toBe(true);
    history.add("accepted-256");
    expect(history.has("accepted-0")).toBe(false);
    expect(history.has("accepted-1")).toBe(true);
    expect(history.has("accepted-256")).toBe(true);
    history.add("accepted-257");
    expect(history.has("accepted-1")).toBe(false);
    expect(history.has("accepted-2")).toBe(true);
  });

  test("broadcasts fresh independently projected snapshots with room metadata and no secrets", () => {
    const room = game();
    const state = room.state();
    for (let index = 0; index < 3; index++) {
      const snapshot = latest(room.peers[index]!);
      expect(snapshot).toMatchObject({ roomCode: room.roomCode, hostPlayerId: room.seats[0]!.playerId, viewerId: room.seats[index]!.playerId, revision: state.revision });
      expect(snapshot.hand).toEqual(state.players[index]!.hand);
      expect(snapshot.players.map(({ name, online }) => ({ name, online }))).toEqual([
        { name: "Alice", online: true }, { name: "Bob", online: true }, { name: "Carol", online: true },
      ]);
      const json = JSON.stringify(snapshot);
      for (const secret of [...room.seats.map(({ token }) => token), ...state.drawPile.map(({ instanceId }) => instanceId)]) expect(json).not.toContain(`"${secret}"`);
      for (const opponent of state.players.filter((_, other) => other !== index)) for (const card of opponent.hand) expect(json).not.toContain(`"${card.instanceId}"`);
      expect(json).not.toMatch(/token|reconnectDeadline|timers|drawPile/);
    }
    latest(room.peers[0]!).players[0]!.name = "Tampered";
    expect(latest(room.peers[1]!).players[0]!.name).toBe("Alice");
    expect(room.store.getRoom(room.roomCode)!.players[0]!.name).toBe("Alice");
  });

  test("inspection copies cannot mutate authoritative hands or membership", () => {
    const room = game();
    const copy = room.store.getRoom(room.roomCode)!;
    copy.players.length = 0;
    copy.game!.players[0]!.hand.length = 0;
    expect(room.state().players[0]!.hand).toHaveLength(7);
    expect(room.store.getRoom(room.roomCode)!.players).toHaveLength(3);
  });
});

describe("disconnect, reconnect and cleanup", () => {
  // Break caught: removing a Mercy-eliminated seat erases the gameplay cause before round scoring.
  test.each(["leave", "expire"] as const)("%s preserves an earlier gameplay Mercy cause through round completion", (mode) => {
    const hands = defaultHands.slice(0, 3).map((hand) => [...hand]);
    hands[0]![0] = "wild-draw-10";
    hands[1]![0] = "wild-draw-10";
    const room = game(hands);
    value(room.play(0, "wild-draw-10"));
    value(room.command(0, { type: "choose-color", color: "red" }));
    value(room.play(1, "wild-draw-10"));
    value(room.command(1, { type: "choose-color", color: "blue" }));
    value(room.command(2, { type: "accept-draw" }));
    const eliminatedId = room.seats[2]!.playerId;
    expect(room.state().players[2]).toMatchObject({ eliminated: true, hand: [], eliminatedByPlayerId: eliminatedId });
    expect(room.state().phase).toBe("playing");

    if (mode === "leave") value(room.command(2, { type: "leave-room" }));
    else {
      room.store.disconnect(room.roomCode, eliminatedId, room.peers[2]!.id);
      room.clock.advance(50_000);
    }
    expect(room.store.getRoom(room.roomCode)!.players.map(({ id }) => id)).not.toContain(eliminatedId);
    expect(room.state().players[2]).toMatchObject({ eliminated: true, hand: [], eliminatedByPlayerId: eliminatedId });
    expect(room.state().phase).toBe("playing");

    // An ordinary departure ends the round without gaining a new gameplay cause.
    value(room.command(1, { type: "leave-room" }));
    expect(room.state()).toMatchObject({ phase: "finished", winner: room.seats[0]!.playerId });
    expect(room.state().players[1]).toMatchObject({ eliminated: true, eliminatedByPlayerId: null });
    expect(room.state().players[2]).toMatchObject({ eliminated: true, hand: [], eliminatedByPlayerId: eliminatedId });
  });

  test("disconnect preserves the full hand and eligibility until exactly 50,000ms", () => {
    const room = game();
    const hand = room.state().players[0]!.hand;
    room.store.disconnect(room.roomCode, room.seats[0]!.playerId, room.peers[0]!.id);
    expect(latest(room.peers[1]!).players[0]!.online).toBe(false);
    room.clock.advance(49_999);
    expect(room.state().players[0]).toMatchObject({ hand, eliminated: false });
    expect(room.state().currentPlayerId).toBe(room.seats[0]!.playerId);
    room.clock.advance(1);
    expect(room.state().players[0]).toMatchObject({ hand: [], eliminated: true });
    expect(room.state().currentPlayerId).toBe(room.seats[1]!.playerId);
    expect(room.state().drawPile.some((card) => hand.some((held) => held.instanceId === card.instanceId))).toBe(false);
    expect(room.store.connect(room.roomCode, room.seats[0]!.token, peer("expired"))).toMatchObject({ ok: false, code: "INVALID_TOKEN" });
    expect(room.clock.timers.size).toBe(0);
  });

  test("reconnect cancels expiry, preserves identity and hand, and ignores superseded callbacks", () => {
    const room = game();
    const hand = room.state().players[0]!.hand;
    room.store.disconnect(room.roomCode, room.seats[0]!.playerId, room.peers[0]!.id);
    const canceled = [...room.clock.timers.values()][0]!.callback;
    room.clock.advance(49_999);
    const replacement = peer("replacement");
    expect(value(room.store.connect(room.roomCode, room.seats[0]!.token, replacement)).playerId).toBe(room.seats[0]!.playerId);
    expect(latest(replacement).hand).toEqual(hand);
    canceled();
    room.clock.advance(100_000);
    expect(room.state().players[0]).toMatchObject({ hand, eliminated: false });
    expect(latest(room.peers[1]!).players[0]!.online).toBe(true);
    expect(room.clock.timers.size).toBe(0);
  });

  test("replacing a live peer closes it once and its close cannot disconnect the replacement", () => {
    const room = lobby(2);
    const old = peer("old", () => room.store.disconnect(room.roomCode, room.seats[0]!.playerId, "old"));
    value(room.store.connect(room.roomCode, room.seats[0]!.token, old));
    const replacement = peer("replacement");
    value(room.store.connect(room.roomCode, room.seats[0]!.token, replacement));
    expect(old.closes).toHaveLength(1);
    expect(room.peers[0]!.closes).toHaveLength(1);
    expect(latest(replacement).players[0]!.online).toBe(true);
    room.store.disconnect(room.roomCode, room.seats[0]!.playerId, "old");
    expect(room.clock.timers.size).toBe(0);
    value(room.command(0, { type: "leave-room" }));
    expect(replacement.closes).toHaveLength(1);
    expect(old.closes).toHaveLength(1);
  });

  test("duplicate close events cannot extend the deadline or create multiple timers", () => {
    const room = game();
    room.store.disconnect(room.roomCode, room.seats[0]!.playerId, room.peers[0]!.id);
    room.clock.advance(20_000);
    room.store.disconnect(room.roomCode, room.seats[0]!.playerId, room.peers[0]!.id);
    expect(room.clock.timers.size).toBe(1);
    room.clock.advance(30_000);
    expect(room.state().players[0]!.eliminated).toBe(true);
  });

  test("a late reconnect is rejected even before a delayed expiry callback executes", () => {
    const room = game();
    room.store.disconnect(room.roomCode, room.seats[0]!.playerId, room.peers[0]!.id);
    room.clock.time += 50_000;
    expect(room.store.connect(room.roomCode, room.seats[0]!.token, peer("too-late"))).toMatchObject({ ok: false, code: "INVALID_TOKEN" });
    expect(room.state().players[0]!.eliminated).toBe(true);
    expect(room.clock.timers.size).toBe(0);
  });

  // Break caught: delayed settlement awards the winner by seat order instead of expiry time.
  test("timely callbacks and delayed settlement preserve the same last-player winner", () => {
    const timely = expiryWinner("timely", 1_000);
    expect(timely).toMatchObject({ winner: "Alice", eliminated: [true, true, true], retainedNames: ["Carol"] });
    expect(expiryWinner("delayed-settlement", 1_000)).toEqual(timely);
  });

  // Break caught: a later-deadline callback expires its seat before an earlier overdue seat.
  test("a delayed timer delivered out of order agrees with timely last-player detection", () => {
    const timely = expiryWinner("timely", 1_000);
    expect(timely.winner).toBe("Alice");
    expect(expiryWinner("delayed-timer", 1_000)).toEqual(timely);
  });

  // Break caught: equal deadlines are resolved by callback delivery order rather than seat order.
  test("equal deadlines use seat order consistently across callback and settlement delivery", () => {
    const timely = expiryWinner("timely", 0);
    expect(timely.winner).toBe("Bob");
    expect(expiryWinner("delayed-settlement", 0)).toEqual(timely);
    expect(expiryWinner("delayed-timer", 0)).toEqual(timely);
  });

  // Break caught: a delayed timer lets the next command select a seat past its deadline.
  test("commands settle overdue grace before validating revision or mutating the engine", () => {
    const room = game();
    room.store.disconnect(room.roomCode, room.seats[1]!.playerId, room.peers[1]!.id);
    const before = room.state();
    const cardId = before.players[0]!.hand.find(({ faceId }) => faceId === "red-1")!.instanceId;
    const command = envelope({ type: "play-card", cardId }, before.revision, "after-deadline");
    room.clock.time += 50_000; // Simulate an event loop whose timer callback is delayed.
    expect(room.store.handleCommand(room.roomCode, room.seats[0]!.playerId, command)).toMatchObject({ ok: false, code: "STALE_REVISION", revision: before.revision + 1 });
    expect(room.state().players[1]!.eliminated).toBe(true);
    expect(room.state().players[0]!.hand).toEqual(before.players[0]!.hand);
    value(room.store.handleCommand(room.roomCode, room.seats[0]!.playerId, { ...command, revision: before.revision + 1 }));
    expect(room.state().currentPlayerId).toBe(room.seats[2]!.playerId);
    expect(room.clock.timers.size).toBe(0);
  });

  test("joining releases an expired lobby name even when its timer callback is delayed", () => {
    const room = lobby(2);
    room.store.disconnect(room.roomCode, room.seats[1]!.playerId, room.peers[1]!.id);
    room.clock.time += 50_000;
    const replacement = value(room.store.joinRoom(room.roomCode, "Bob"));
    expect(replacement.playerId).not.toBe(room.seats[1]!.playerId);
    expect(room.store.getRoom(room.roomCode)!.players.map(({ name }) => name)).toEqual(["Alice", "Bob"]);
    expect(room.clock.timers.size).toBe(1); // Only the new seat's initial connection grace.
  });

  // Break caught: a throwing transport becomes untracked without being closed.
  test("a failed send closes that peer once and starts grace without aborting other broadcasts", () => {
    const room = lobby(2);
    let closes = 0;
    const broken: RoomPeer = {
      id: "broken", send() { throw new Error("Transport unavailable"); }, close() { closes++; },
    };
    value(room.store.connect(room.roomCode, room.seats[0]!.token, broken));
    expect(closes).toBe(1);
    expect(latest(room.peers[1]!).players[0]!.online).toBe(false);
    expect(room.clock.timers.size).toBe(1);
    room.clock.advance(50_000);
    expect(room.store.getRoom(room.roomCode)!.players).toHaveLength(1);
    expect(closes).toBe(1);
  });

  test.each(["leave", "expire"] as const)("%s resolves the last-player winner and completed room lifetime", (mode) => {
    const room = game(defaultHands.slice(0, 2));
    if (mode === "leave") value(room.command(0, { type: "leave-room" }));
    else {
      room.store.disconnect(room.roomCode, room.seats[0]!.playerId, room.peers[0]!.id);
      room.clock.advance(50_000);
    }
    expect(room.state()).toMatchObject({ phase: "finished", winner: room.seats[1]!.playerId, pendingChoice: null, drawStack: null });
    expect(room.state().players[0]).toMatchObject({ eliminated: true, hand: [], eliminatedByPlayerId: null });
    room.store.disconnect(room.roomCode, room.seats[1]!.playerId, room.peers[1]!.id);
    room.clock.advance(49_999);
    expect(room.store.getRoom(room.roomCode)).not.toBeNull();
    room.clock.advance(1);
    expect(room.store.getRoom(room.roomCode)).toBeNull();
    expect(room.clock.timers.size).toBe(0);
  });

  test("intentional departures delete completed rooms and cancel outstanding timers", () => {
    const room = game(defaultHands.slice(0, 2));
    room.store.disconnect(room.roomCode, room.seats[1]!.playerId, room.peers[1]!.id);
    const callback = [...room.clock.timers.values()][0]!.callback;
    value(room.command(0, { type: "leave-room" }));
    value(room.command(1, { type: "leave-room" }));
    expect(room.store.getRoom(room.roomCode)).toBeNull();
    expect(room.clock.timers.size).toBe(0);
    callback();
    room.clock.advance(100_000);
    expect(room.store.getRoom(room.roomCode)).toBeNull();
    expect(room.peers[0]!.closes).toHaveLength(1);
  });
});

describe("pending-state departure recovery", () => {
  test("color choice remains usable after reconnect with its exact accumulated stack", () => {
    const room = game();
    value(room.play(0, "red-draw-4"));
    value(room.play(1, "wild-draw-6"));
    const before = room.state();
    room.store.disconnect(room.roomCode, room.seats[1]!.playerId, room.peers[1]!.id);
    room.clock.advance(49_999);
    expect(room.state()).toMatchObject({ phase: "awaiting-choice", pendingChoice: { type: "choose-color", playerId: room.seats[1]!.playerId }, drawStack: { amount: 10, minimumDrawValue: 6 }, currentPlayerId: room.seats[1]!.playerId });
    const replacement = peer("replacement");
    value(room.store.connect(room.roomCode, room.seats[1]!.token, replacement));
    expect(latest(replacement).hand).toEqual(before.players[1]!.hand);
    expect(latest(replacement).allowedControls).toContain("choose-color");
    value(room.command(1, { type: "choose-color", color: "blue" }));
    expect(room.state()).toMatchObject({ phase: "playing", pendingChoice: null, drawStack: { amount: 10, minimumDrawValue: 6 }, currentPlayerId: room.seats[2]!.playerId });
  });

  // Break caught: clearing/duplicating the stacked total or stranding an eliminated choice owner.
  test("expiring a color-choice owner carries the existing stack once to the next eligible seat", () => {
    const room = game(defaultHands.slice(0, 4));
    value(room.play(0, "red-draw-4"));
    value(room.play(1, "wild-draw-6"));
    value(room.command(2, { type: "leave-room" }));
    const before = room.state();
    room.store.disconnect(room.roomCode, room.seats[1]!.playerId, room.peers[1]!.id);
    room.clock.advance(50_000);
    expect(room.state()).toMatchObject({ phase: "playing", pendingChoice: null, activeColor: "red", drawStack: { amount: 10, minimumDrawValue: 6 }, currentPlayerId: room.seats[3]!.playerId });
    expect(room.state().drawPile).toEqual(before.drawPile);
    expect(room.state().discardPile).toEqual(before.discardPile);
    value(room.command(3, { type: "accept-draw" }));
    expect(room.state().players[3]!.hand).toHaveLength(17);
    expect(room.state().drawPile).toHaveLength(before.drawPile.length - 10);
    expect(room.state().drawStack).toBeNull();
    expect(room.state().currentPlayerId).toBe(room.seats[0]!.playerId);
  });

  test("active draw stack remains intact through disconnect and reconnect", () => {
    const room = game();
    value(room.play(0, "red-draw-4"));
    room.store.disconnect(room.roomCode, room.seats[1]!.playerId, room.peers[1]!.id);
    room.clock.advance(49_999);
    expect(room.state()).toMatchObject({ drawStack: { amount: 4, minimumDrawValue: 4 }, currentPlayerId: room.seats[1]!.playerId });
    const replacement = peer("stack-reconnect");
    value(room.store.connect(room.roomCode, room.seats[1]!.token, replacement));
    expect(latest(replacement).allowedControls).toContain("accept-draw");
    value(room.command(1, { type: "accept-draw" }));
    expect(room.state().players[1]!.hand).toHaveLength(11);
    expect(room.state().drawStack).toBeNull();
  });

  test("expiring a stack recipient skips eliminated seats but keeps grace seats eligible", () => {
    const room = game(defaultHands);
    value(room.command(2, { type: "leave-room" }));
    value(room.command(4, { type: "leave-room" }));
    value(room.play(0, "red-draw-4"));
    const before = room.state();
    room.store.disconnect(room.roomCode, room.seats[1]!.playerId, room.peers[1]!.id);
    room.clock.advance(1_000);
    room.store.disconnect(room.roomCode, room.seats[3]!.playerId, room.peers[3]!.id);
    room.clock.advance(49_000);
    expect(room.state()).toMatchObject({ phase: "playing", drawStack: { amount: 4, minimumDrawValue: 4 }, currentPlayerId: room.seats[3]!.playerId });
    expect(room.state().players[3]!.eliminated).toBe(false);
    expect(room.state().drawPile).toEqual(before.drawPile);
    room.clock.advance(1_000);
    expect(room.state().currentPlayerId).toBe(room.seats[5]!.playerId);
    value(room.command(5, { type: "accept-draw" }));
    expect(room.state().players[5]!.hand).toHaveLength(11);
    expect(room.state().drawStack).toBeNull();
  });

  test.each(["red-7", "wild-color-roulette"])("expiring the impossible %s owner clears its choice without drawing or transferring cards", (face) => {
    const hands = defaultHands.slice(0, 3).map((hand) => [...hand]);
    hands[0]![0] = face;
    const room = game(hands);
    value(room.play(0, face));
    const owner = face === "red-7" ? 0 : 1;
    const before = room.state();
    room.store.disconnect(room.roomCode, room.seats[owner]!.playerId, room.peers[owner]!.id);
    room.clock.advance(50_000);
    expect(room.state()).toMatchObject({ phase: "playing", pendingChoice: null, currentPlayerId: room.seats[owner + 1]!.playerId });
    expect(room.state().drawPile).toEqual(before.drawPile);
    expect(room.state().players[owner + 1]!.hand).toEqual(before.players[owner + 1]!.hand);
  });

  test("expiry follows reversed direction after a wild reverse and never re-adds its penalty", () => {
    const hands = defaultHands.slice(0, 4).map((hand) => [...hand]);
    hands[0]![0] = "wild-reverse-draw-4";
    const room = game(hands);
    value(room.play(0, "wild-reverse-draw-4"));
    value(room.command(3, { type: "leave-room" }));
    room.store.disconnect(room.roomCode, room.seats[0]!.playerId, room.peers[0]!.id);
    room.clock.advance(50_000);
    expect(room.state()).toMatchObject({ direction: -1, currentPlayerId: room.seats[2]!.playerId, phase: "playing", pendingChoice: null, drawStack: { amount: 4, minimumDrawValue: 4 } });
  });
});

describe("serialized UNO command races", () => {
  test.each(["declare-first", "catch-first"] as const)("%s resolves once and rejects duplicate and stale competitors", (order) => {
    const hands = defaultHands.slice(0, 3).map((hand) => [...hand]);
    hands[0] = ["red-discard-all", "red-1", "red-2", "red-3", "red-4", "red-8", "yellow-1"];
    const room = game(hands);
    value(room.play(0, "red-discard-all"));
    const revision = room.state().revision;
    const declaration = envelope({ type: "declare-uno" }, revision, "uno");
    const catchCommand = envelope({ type: "catch-uno", targetPlayerId: room.seats[0]!.playerId }, revision, "catch");
    const [firstSeat, first, otherSeat, other] = order === "declare-first"
      ? [0, declaration, 1, catchCommand] as const : [1, catchCommand, 0, declaration] as const;
    value(room.store.handleCommand(room.roomCode, room.seats[firstSeat]!.playerId, first));
    expect(room.state().revision).toBe(revision + 1);
    expect(room.state().players[0]!.hand).toHaveLength(order === "declare-first" ? 1 : 3);
    expect(room.store.handleCommand(room.roomCode, room.seats[firstSeat]!.playerId, first)).toMatchObject({ ok: false, code: "DUPLICATE_COMMAND" });
    expect(room.store.handleCommand(room.roomCode, room.seats[otherSeat]!.playerId, other)).toMatchObject({ ok: false, code: "STALE_REVISION" });
    expect(room.store.handleCommand(room.roomCode, room.seats[otherSeat]!.playerId, { ...other, revision: revision + 1 })).toMatchObject({ ok: false, code: "uno-unavailable" });
    expect(room.state().revision).toBe(revision + 1);
    expect(room.state().players[0]!.hand).toHaveLength(order === "declare-first" ? 1 : 3);
  });
});
