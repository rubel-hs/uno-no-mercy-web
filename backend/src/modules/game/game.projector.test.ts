import { describe, expect, test } from "bun:test";
import { applyGameCommand } from "./game.engine";
import { parseClientMessage, type ClientCommand } from "./game.protocol";
import { projectPlayerSnapshot } from "./game.projector";
import type { GameState } from "./game.types";

function fixture(): GameState {
  return {
    players: [
      { id: "a", name: "Alice", online: true, eliminated: false, hand: [{ instanceId: "own-red", faceId: "red-3" }, { instanceId: "own-blue", faceId: "blue-2" }] },
      { id: "b", name: "Bob", online: false, eliminated: false, hand: [{ instanceId: "opponent-secret", faceId: "yellow-9" }] },
      { id: "c", name: "Carol", online: true, eliminated: true, hand: [] },
    ],
    drawPile: [{ instanceId: "draw-secret", faceId: "green-8" }],
    discardPile: [{ instanceId: "buried-secret", faceId: "green-4" }, { instanceId: "top", faceId: "red-5" }],
    direction: -1, currentPlayerId: "a", activeColor: "red", phase: "playing",
    pendingChoice: null, drawStack: null, unoWindow: null, winner: null, revision: 4, gameplaySequence: 2,
  };
}

function envelope(command: unknown = { type: "draw-until-playable" }): Record<string, unknown> {
  return { version: 1, type: "command", commandId: "cmd-1", revision: 0, command };
}

describe("private snapshots", () => {
  // Catches spreading authoritative objects, including nested values, into public JSON.
  test("projects own physical cards and only public player summaries after serialization", () => {
    const state = fixture();
    Object.assign(state, { token: "state-token", timers: ["timer-secret"] });
    Object.assign(state.players[1]!, { token: "opponent-token", deadline: "deadline-secret" });
    Object.assign(state.players[0]!.hand[0]!, { secret: "card-secret" });
    const before = structuredClone(state);
    const snapshot = projectPlayerSnapshot(state, "a");
    const json = JSON.stringify(snapshot);
    expect(JSON.parse(json).hand).toEqual([{ instanceId: "own-red", faceId: "red-3" }, { instanceId: "own-blue", faceId: "blue-2" }]);
    expect(snapshot.players).toEqual([
      { id: "a", name: "Alice", order: 0, cardCount: 2, online: true, eliminated: false },
      { id: "b", name: "Bob", order: 1, cardCount: 1, online: false, eliminated: false },
      { id: "c", name: "Carol", order: 2, cardCount: 0, online: true, eliminated: true },
    ]);
    expect(snapshot).toMatchObject({ viewerId: "a", revision: 4, drawCount: 1, topDiscard: { faceId: "red-5" }, currentPlayerId: "a", direction: -1, activeColor: "red", phase: "playing", winner: null });
    for (const secret of ["opponent-secret", "yellow-9", "draw-secret", "green-8", "buried-secret", "green-4", "state-token", "timer-secret", "opponent-token", "deadline-secret", "card-secret", "drawPile", "gameplaySequence"]) expect(json).not.toContain(secret);
    expect(state).toEqual(before);
    snapshot.hand[0]!.faceId = "blue-0";
    expect(state.players[0]!.hand[0]!.faceId).toBe("red-3");
  });

  // Catches losing room metadata defaults, or granting cards to unknown viewers.
  test("supports engine-only players and gives unknown viewers no cards or controls", () => {
    const state = fixture();
    delete state.players[0]!.name;
    delete state.players[0]!.online;
    expect(projectPlayerSnapshot(state, "a").players[0]).toMatchObject({ name: "a", online: true });
    const snapshot = projectPlayerSnapshot(state, "missing");
    expect(snapshot.hand).toEqual([]);
    expect(snapshot.legalCardIds).toEqual([]);
    expect(snapshot.allowedControls).toEqual([]);
  });

  // Catches matching-card affordances being granted out of turn or during mandatory choices.
  test("limits legal cards and normal controls to the active eligible viewer", () => {
    const state = fixture();
    expect(projectPlayerSnapshot(state, "a").legalCardIds).toEqual(["own-red"]);
    expect(projectPlayerSnapshot(state, "a").allowedControls).toEqual(["play-card", "draw-and-pass", "leave-room"]);
    state.activeColor = "yellow";
    expect(projectPlayerSnapshot(state, "b").legalCardIds).toEqual([]);
    expect(projectPlayerSnapshot(state, "b").allowedControls).toEqual(["leave-room"]);
    state.activeColor = "green";
    expect(projectPlayerSnapshot(state, "a").allowedControls).toEqual(["draw-until-playable", "leave-room"]);
    state.pendingChoice = { type: "resolve-action", playerId: "a", cardId: "unsafe-action-secret" };
    state.phase = "pending-effect";
    const pending = projectPlayerSnapshot(state, "a");
    expect(pending.legalCardIds).toEqual([]);
    expect(pending.allowedControls).toEqual(["leave-room"]);
    expect(pending.pendingChoice).toBeNull();
    expect(JSON.stringify(pending)).not.toContain("unsafe-action-secret");
  });

  // Catches allowing an ordinary draw during a stack, or hiding optional acceptance.
  test("projects stack thresholds and allows accepting even with a legal stack card", () => {
    const state = fixture();
    state.drawStack = { amount: 10, minimumDrawValue: 4 };
    state.players[0]!.hand.push({ instanceId: "stack", faceId: "wild-draw-6" });
    Object.assign(state.drawStack, { secret: "stack-secret" });
    const snapshot = projectPlayerSnapshot(state, "a");
    expect(snapshot.drawStack).toEqual({ amount: 10, minimumDrawValue: 4 });
    expect(snapshot.legalCardIds).toEqual(["stack"]);
    expect(snapshot.allowedControls).toEqual(["play-card", "accept-draw", "leave-room"]);
  });

  // Catches unsafe pending data and choices enabled for another player or an eliminated seat.
  test.each(["choose-color", "choose-swap-target", "choose-roulette-color"] as const)("exposes only safe %s and grants it only to its owner", (type) => {
    const state = fixture();
    state.phase = "awaiting-choice";
    state.pendingChoice = { type, playerId: "a" };
    Object.assign(state.pendingChoice!, { cardId: "pending-secret", token: "pending-token" });
    const snapshot = projectPlayerSnapshot(state, "a");
    expect(snapshot.pendingChoice).toEqual({ type, playerId: "a" });
    expect(snapshot.allowedControls).toEqual([type, "leave-room"]);
    expect(snapshot.legalCardIds).toEqual([]);
    expect(projectPlayerSnapshot(state, "b").allowedControls).toEqual(["leave-room"]);
    expect(projectPlayerSnapshot(state, "c").allowedControls).toEqual(["leave-room"]);
    expect(JSON.stringify(snapshot)).not.toContain("pending-secret");
    expect(JSON.stringify(snapshot)).not.toContain("pending-token");
  });

  // Catches exposing server UNO sequence deadlines or offering an expired catch/declaration.
  test("projects live UNO controls and strips private expiry bookkeeping", () => {
    const state = fixture();
    state.unoWindow = { playerId: "b", declared: false, expiresAtGameplaySequence: 3 };
    expect(projectPlayerSnapshot(state, "b").allowedControls).toEqual(["declare-uno", "leave-room"]);
    const snapshot = projectPlayerSnapshot(state, "a");
    expect(snapshot.unoWindow).toEqual({ playerId: "b", declared: false });
    expect(snapshot.allowedControls).toContain("catch-uno");
    expect(JSON.stringify(snapshot)).not.toContain("expiresAtGameplaySequence");
    state.unoWindow.declared = true;
    expect(projectPlayerSnapshot(state, "a").allowedControls).not.toContain("catch-uno");
    state.unoWindow.declared = false;
    state.gameplaySequence = 3;
    expect(projectPlayerSnapshot(state, "b").allowedControls).not.toContain("declare-uno");
    expect(projectPlayerSnapshot(state, "a").unoWindow).toBeNull();
  });

  // Catches terminal or eliminated players receiving turn or UNO actions.
  test("finished games and eliminated viewers have no gameplay controls", () => {
    const state = fixture();
    state.players[0]!.eliminated = true;
    expect(projectPlayerSnapshot(state, "a").legalCardIds).toEqual([]);
    expect(projectPlayerSnapshot(state, "a").allowedControls).toEqual(["leave-room"]);
    state.phase = "finished";
    state.winner = "b";
    expect(projectPlayerSnapshot(state, "b").allowedControls).toEqual(["leave-room"]);
    expect(projectPlayerSnapshot(state, "b").winner).toBe("b");
  });

  // Catches projector controls disagreeing with a real engine transition.
  test("refreshes legal actions after an accepted authoritative play", () => {
    const state = fixture();
    const result = applyGameCommand(state, { type: "play-card", playerId: "a", cardId: "own-red" });
    expect(result.ok).toBe(true);
    const snapshot = projectPlayerSnapshot(result.state, "b");
    expect(snapshot.currentPlayerId).toBe("b");
    expect(snapshot.revision).toBe(5);
    expect(snapshot.allowedControls).toContain("draw-until-playable");
    expect(snapshot.allowedControls).toContain("catch-uno");
  });
});

describe("version 1 command parsing", () => {
  // Catches a missing command branch or a parser that retains actor identity.
  test.each<ClientCommand>([
    { type: "start-game" }, { type: "leave-room" },
    { type: "play-card", cardId: "card" }, { type: "play-card", cardId: "card", declareUno: false },
    { type: "play-card", cardId: "card", declareUno: true },
    { type: "draw-until-playable" }, { type: "draw-and-pass" }, { type: "accept-draw" },
    { type: "choose-color", color: "red" }, { type: "choose-color", color: "yellow" },
    { type: "choose-roulette-color", color: "green" }, { type: "choose-roulette-color", color: "blue" },
    { type: "choose-swap-target", targetPlayerId: "b" }, { type: "declare-uno" },
    { type: "catch-uno", targetPlayerId: "b" },
  ])("accepts public command %j", (command) => {
    const parsed = parseClientMessage(envelope(command));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("Expected valid command");
    expect(parsed.value).toEqual({ version: 1, type: "command", commandId: "cmd-1", revision: 0, command });
  });

  // Catches off-by-one length validation and rejecting a valid initial revision.
  test("accepts a 64-character command id and safe integer revision", () => {
    expect(parseClientMessage({ ...envelope(), commandId: "x".repeat(64), revision: Number.MAX_SAFE_INTEGER }).ok).toBe(true);
  });

  // Catches malformed envelope data getting through to room mutation.
  const invalidEnvelopes: unknown[] = [
    undefined, null, false, 7, "{}", [], {},
    { ...envelope(), version: 2 }, { ...envelope(), version: "1" },
    { ...envelope(), type: "authenticate", token: "private" },
    { ...envelope(), commandId: undefined }, { ...envelope(), commandId: "" },
    { ...envelope(), commandId: " \t\n" }, { ...envelope(), commandId: "x".repeat(65) },
    { ...envelope(), commandId: 123 }, { ...envelope(), revision: undefined },
    ...[-1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "0", null].map((revision) => ({ ...envelope(), revision })),
    { ...envelope(), playerId: "victim" }, { ...envelope(), unknown: true },
    { version: 1, type: "authenticate", token: "private" },
    { ...envelope(), command: undefined },
  ];
  test.each(invalidEnvelopes.map((value) => ({ value })))("rejects malformed envelope %# without throwing", ({ value }) => {
    expect(parseClientMessage(value)).toEqual({ ok: false, code: "INVALID_MESSAGE" });
  });

  // Catches missing command payload checks, coercion, and unrecognized nested fields.
  test.each([
    null, [], "play-card", {}, { type: "unknown" },
    { type: "play-card" }, { type: "play-card", cardId: "" }, { type: "play-card", cardId: " " },
    { type: "play-card", cardId: 1 }, { type: "play-card", cardId: "x", declareUno: "true" },
    { type: "play-card", cardId: "x", declareUno: null }, { type: "play-card", cardId: "x", declareUno: undefined },
    { type: "choose-color", color: "wild" }, { type: "choose-color", color: "RED" },
    { type: "choose-roulette-color" }, { type: "choose-roulette-color", color: {} },
    { type: "choose-swap-target", targetPlayerId: "" }, { type: "choose-swap-target", targetPlayerId: [] },
    { type: "catch-uno" }, { type: "catch-uno", targetPlayerId: null },
    { type: "declare-uno", payload: {} }, { type: "start-game", playerId: "victim" },
    { type: "play-card", cardId: "x", playerId: "victim" },
    { type: "choose-swap-target", targetPlayerId: "b", actorId: "victim" },
    { type: "leave-room", token: "private" }, { type: "accept-draw", unknown: true },
  ].map((command) => ({ command })))("rejects malformed command %#", ({ command }) => {
    expect(parseClientMessage(envelope(command))).toEqual({ ok: false, code: "INVALID_MESSAGE" });
  });

  // Catches command variants accidentally accepting actor identity or arbitrary extra keys.
  test.each(["start-game", "leave-room", "draw-until-playable", "draw-and-pass", "accept-draw", "declare-uno"])("strictly validates payload-free %s", (type) => {
    for (const key of ["playerId", "actorId", "color", "cardId", "targetPlayerId"]) {
      expect(parseClientMessage(envelope({ type, [key]: "x" }))).toEqual({ ok: false, code: "INVALID_MESSAGE" });
    }
  });

  // Catches exceptions from hostile non-JSON values escaping the parser boundary.
  test("rejects getters, custom prototypes, symbols and throwing proxies safely", () => {
    const getter = Object.defineProperty(envelope(), "command", { get() { throw new Error("secret"); } });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    const values = [getter, new Date(), Object.assign(Object.create({ secret: true }), envelope()), { ...envelope(), [Symbol("secret")]: true }, revoked.proxy];
    for (const value of values) expect(parseClientMessage(value)).toEqual({ ok: false, code: "INVALID_MESSAGE" });
  });

  // Catches retaining caller-owned objects that can change after validation.
  test("returns a detached validated envelope", () => {
    const input = envelope({ type: "play-card", cardId: "safe" });
    const parsed = parseClientMessage(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("Expected valid command");
    (input.command as { cardId: string }).cardId = "changed";
    input.revision = -1;
    expect(parsed.value).toEqual({ version: 1, type: "command", commandId: "cmd-1", revision: 0, command: { type: "play-card", cardId: "safe" } });
  });

  // Catches validation of an early proxy read followed by acceptance of a different value.
  test.each([
    { field: "revision", validReads: 3, changed: -1 },
    { field: "commandId", validReads: 2, changed: { unvalidated: true } },
  ])("captures envelope $field data before validating a changing-value proxy", ({ field, validReads, changed }) => {
    let reads = 0;
    const input = new Proxy(envelope(), {
      get(target, key) {
        if (key === field && ++reads > validReads) return changed;
        return Reflect.get(target, key);
      },
    });
    expect(parseClientMessage(input)).toEqual({
      ok: true,
      value: { version: 1, type: "command", commandId: "cmd-1", revision: 0, command: { type: "draw-until-playable" } },
    });
  });

  // Catches the same validation/return race in every nested command property family.
  test.each([
    { command: { type: "play-card", cardId: "safe" }, field: "cardId" },
    { command: { type: "play-card", cardId: "safe" }, field: "type" },
    { command: { type: "play-card", cardId: "safe", declareUno: true }, field: "declareUno" },
    { command: { type: "choose-color", color: "red" }, field: "color" },
    { command: { type: "choose-swap-target", targetPlayerId: "b" }, field: "targetPlayerId" },
  ])("captures nested $field data before validating a changing-value proxy", ({ command, field }) => {
    let reads = 0;
    const input = new Proxy(command, {
      get(target, key) {
        if (key === field && ++reads > 1) return { unvalidated: true };
        return Reflect.get(target, key);
      },
    });
    const parsed = parseClientMessage(envelope(input));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error("Expected captured valid command");
    expect(parsed.value.command).toEqual(command as ClientCommand);
    expect(Object.getPrototypeOf(parsed.value)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(parsed.value.command)).toBe(Object.prototype);
  });
});
