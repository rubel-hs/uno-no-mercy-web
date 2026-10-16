import { createDeck, shuffleDeck } from "../game/deck";
import { applyGameCommand, createGameState } from "../game/game.engine";
import { parseClientMessage, type CommandErrorCode, type PlayerSnapshot, type ServerMessage } from "../game/game.protocol";
import { projectPlayerSnapshot } from "../game/game.projector";
import type { GameState } from "../game/game.types";
import { getNextEligiblePlayerId } from "../game/turn-order";
import type { RoomCredentials, RoomInspection, RoomPeer, RoomResult, RoomStore, RoomStoreDeps } from "./room.types";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const GRACE_MS = 50_000;
const HISTORY_LIMIT = 256;

/** Each seat remembers accepted IDs only, in acceptance order. */
export class AcceptedCommandHistory {
  private readonly ids = new Set<string>();
  has(id: string): boolean { return this.ids.has(id); }
  add(id: string): void {
    this.ids.add(id);
    if (this.ids.size > HISTORY_LIMIT) this.ids.delete(this.ids.values().next().value!);
  }
}

interface Seat {
  id: string;
  name: string;
  token: string;
  peer: RoomPeer | null;
  reconnectDeadline: number | null;
  timer: unknown;
  timerVersion: number;
  commands: AcceptedCommandHistory;
}

interface Room {
  code: string;
  hostPlayerId: string;
  revision: number;
  seats: Map<string, Seat>;
  game: GameState | null;
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code) ? code : null;
}

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 1 && name.length <= 24 ? name : null;
}

function failure(code: CommandErrorCode, revision?: number): RoomResult<never> {
  const messages: Partial<Record<CommandErrorCode, string>> = {
    ROOM_NOT_FOUND: "Room not found.", ROOM_FULL: "This room is full.", ROOM_STARTED: "This game has already started.",
    INVALID_NAME: "Enter a name between 1 and 24 characters.", DUPLICATE_NAME: "That name is already in use.",
    INVALID_TOKEN: "The player session is invalid or expired.", PLAYER_NOT_FOUND: "The player is no longer in this room.",
    NOT_HOST: "Only the host can start the game.", NOT_ENOUGH_PLAYERS: "At least two players are required.",
    "round-not-complete": "The current round is not complete.", "match-complete": "The match is complete.",
    STALE_REVISION: "The room changed. Use the latest snapshot.", DUPLICATE_COMMAND: "This command was already accepted.",
    INVALID_MESSAGE: "Invalid command message.", INTERNAL_ERROR: "The request could not be completed.",
  };
  return { ok: false, code, message: messages[code] ?? "That action is not available.", ...(revision === undefined ? {} : { revision }) };
}

function productionRoomCode(): string {
  // The alphabet has 32 symbols, so all byte residues are equally probable.
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) => ROOM_ALPHABET[byte % 32]).join("");
}

export function createRoomStore(overrides: Partial<RoomStoreDeps> = {}): RoomStore {
  const deps: RoomStoreDeps = {
    now: Date.now,
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    random: Math.random,
    roomCodeFactory: productionRoomCode,
    tokenFactory: () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url"),
    cardIdFactory: () => crypto.randomUUID(),
    ...overrides,
  };
  const rooms = new Map<string, Room>();
  const tokens = new Set<string>();
  const closedPeers = new WeakSet<RoomPeer>();
  const deliveries: (() => void)[] = [];
  let delivering = false;

  // Commit all state/history before invoking transport callbacks. A reentrant
  // callback may submit the next command; its deliveries follow this whole batch.
  function flush(): void {
    if (delivering) return;
    delivering = true;
    try { while (deliveries.length) deliveries.shift()!(); }
    finally { delivering = false; }
  }

  function closePeer(peer: RoomPeer): void {
    if (closedPeers.has(peer)) return;
    closedPeers.add(peer);
    deliveries.push(() => { try { peer.close(1000, "Player session closed"); } catch { /* Transport already closed. */ } });
  }

  function roomFor(input: unknown): Room | undefined {
    const code = normalizeCode(input);
    return code ? rooms.get(code) : undefined;
  }

  function cancelExpiry(seat: Seat): void {
    seat.timerVersion++;
    if (seat.reconnectDeadline !== null) deps.clearTimeout(seat.timer);
    seat.timer = null;
    seat.reconnectDeadline = null;
  }

  function deleteRoom(room: Room): void {
    if (rooms.get(room.code) !== room) return;
    rooms.delete(room.code);
    for (const seat of room.seats.values()) {
      cancelExpiry(seat);
      tokens.delete(seat.token);
      if (seat.peer) closePeer(seat.peer);
      seat.peer = null;
    }
    room.seats.clear();
  }

  function gameWithMetadata(room: Room): GameState {
    return {
      ...room.game!, revision: room.revision,
      players: room.game!.players.map((player) => ({
        ...player, name: room.seats.get(player.id)?.name ?? player.name ?? player.id,
        online: Boolean(room.seats.get(player.id)?.peer),
      })),
    };
  }

  function snapshot(room: Room, viewerId: string): PlayerSnapshot {
    if (room.game) return { ...projectPlayerSnapshot(gameWithMetadata(room), viewerId), roomCode: room.code, hostPlayerId: room.hostPlayerId };
    return {
      roomCode: room.code, hostPlayerId: room.hostPlayerId, viewerId, revision: room.revision, phase: "lobby",
      players: [...room.seats.values()].map((seat, order) => ({
        id: seat.id, name: seat.name, order, cardCount: 0, online: Boolean(seat.peer), eliminated: false,
      })),
      hand: [], drawCount: 0, topDiscard: null, currentPlayerId: null, direction: 1, activeColor: null,
      pendingChoice: null, drawStack: null, unoWindow: null, winner: null, legalCardIds: [],
      allowedControls: viewerId === room.hostPlayerId && room.seats.size >= 2 ? ["start-game", "leave-room"] : ["leave-room"],
    };
  }

  function broadcast(room: Room, event?: Extract<ServerMessage, { type: "lifecycle" }>): void {
    for (const seat of room.seats.values()) {
      const peer = seat.peer;
      if (!peer) continue;
      const message: ServerMessage = { version: 1, type: "snapshot", snapshot: snapshot(room, seat.id) };
      deliveries.push(() => {
        if (rooms.get(room.code) !== room || seat.peer !== peer) return;
        try { if (event) peer.send({ ...event }); peer.send(message); }
        catch { closePeer(peer); disconnect(room.code, seat.id, peer.id); }
      });
    }
  }

  function commit(room: Room, event?: Extract<ServerMessage, { type: "lifecycle" }>): number {
    room.revision++;
    if (room.game) room.game.revision = room.revision;
    if (room.seats.size === 0) deleteRoom(room);
    else broadcast(room, event);
    return room.revision;
  }

  function eliminate(room: Room, playerId: string): void {
    const state = room.game!;
    // Departures create no gameplay cause and preserve any earlier Mercy attribution.
    state.players = state.players.map((player) => player.id === playerId ? { ...player, hand: [], eliminated: true } : player);
    if (state.unoWindow?.playerId === playerId) state.unoWindow = null;
    if (state.phase === "finished") return; // A completed game's winner is historical.
    const active = state.players.filter(({ eliminated }) => !eliminated);
    if (active.length <= 1) {
      state.phase = "finished";
      state.winner = active[0]?.id ?? null;
      state.currentPlayerId = active[0]?.id ?? state.currentPlayerId;
      state.pendingChoice = null;
      state.drawStack = null;
      state.unoWindow = null;
      return;
    }
    if (state.pendingChoice?.playerId === playerId) {
      // The card's effect (including reversal and stack addition) already ran.
      // Keep the previous active color and existing total; only abandon the choice.
      state.pendingChoice = null;
      state.phase = "playing";
    }
    if (state.currentPlayerId === playerId) {
      state.currentPlayerId = getNextEligiblePlayerId(state)!;
    }
  }

  function removeSeat(room: Room, seat: Seat): void {
    cancelExpiry(seat);
    room.seats.delete(seat.id);
    tokens.delete(seat.token);
    const peer = seat.peer;
    seat.peer = null;
    if (peer) closePeer(peer);
    if (room.game) eliminate(room, seat.id);
    else if (room.hostPlayerId === seat.id) room.hostPlayerId = room.seats.keys().next().value ?? "";
  }

  function expireDueSeats(room: Room): void {
    if (rooms.get(room.code) !== room) return;
    const now = deps.now();
    const due = [...room.seats.values()]
      .filter((seat) => !seat.peer && seat.reconnectDeadline !== null && seat.reconnectDeadline <= now)
      // Stable sort preserves seat order as the tie-break for equal deadlines.
      .sort((first, second) => first.reconnectDeadline! - second.reconnectDeadline!);
    for (const seat of due) {
      removeSeat(room, seat);
      commit(room, { version: 1, type: "lifecycle", event: "player-eliminated", playerId: seat.id });
    }
    // Finish the ordered batch before invoking reentrant transport callbacks.
    flush();
  }

  function settleRoom(input: unknown): Room | undefined {
    const room = roomFor(input);
    if (!room) return undefined;
    // Timer callbacks may be delayed by a busy event loop. Enforce the actual
    // deadlines before accepting another membership or gameplay mutation.
    expireDueSeats(room);
    return rooms.get(room.code) === room ? room : undefined;
  }

  function startGrace(room: Room, seat: Seat): void {
    seat.reconnectDeadline = deps.now() + GRACE_MS;
    const version = ++seat.timerVersion;
    const callback = () => {
      if (seat.timerVersion !== version || seat.reconnectDeadline === null || rooms.get(room.code) !== room) return;
      const remaining = seat.reconnectDeadline - deps.now();
      if (remaining > 0) seat.timer = deps.setTimeout(callback, remaining);
      else expireDueSeats(room);
    };
    seat.timer = deps.setTimeout(callback, GRACE_MS);
  }

  function unique(factory: () => string, available: (candidate: string) => boolean): string | null {
    // A broken injected factory must not hang the process or overwrite a room.
    for (let attempt = 0; attempt < 128; attempt++) {
      const candidate = factory();
      if (typeof candidate === "string" && candidate.length > 0 && available(candidate)) return candidate;
    }
    return null;
  }

  function newSeat(name: string): Seat | null {
    const token = unique(deps.tokenFactory, (candidate) => !tokens.has(candidate));
    if (!token) return null;
    return { id: crypto.randomUUID(), name, token, peer: null, reconnectDeadline: null, timer: null, timerVersion: 0, commands: new AcceptedCommandHistory() };
  }

  function retainSeat(room: Room, seat: Seat): RoomCredentials {
    room.seats.set(seat.id, seat);
    tokens.add(seat.token);
    // Also bound abandoned REST create/join requests that never authenticate.
    startGrace(room, seat);
    return { roomCode: room.code, playerId: seat.id, token: seat.token };
  }

  function disconnect(roomCode: string, playerId: string, peerId: string): void {
    const room = settleRoom(roomCode);
    const seat = room?.seats.get(playerId);
    if (!room || !seat?.peer || seat.peer.id !== peerId) return;
    seat.peer = null;
    startGrace(room, seat);
    commit(room, { version: 1, type: "lifecycle", event: "player-disconnected", playerId });
    flush();
  }

  return {
    createRoom(displayName) {
      const name = normalizeName(displayName);
      if (!name) return failure("INVALID_NAME");
      try {
        const code = unique(deps.roomCodeFactory, (candidate) => normalizeCode(candidate) === candidate && !rooms.has(candidate));
        if (!code) return failure("INTERNAL_ERROR");
        const seat = newSeat(name);
        if (!seat) return failure("INTERNAL_ERROR");
        const room: Room = { code, hostPlayerId: seat.id, revision: 0, seats: new Map(), game: null };
        rooms.set(code, room);
        return { ok: true, value: retainSeat(room, seat) };
      } catch { return failure("INTERNAL_ERROR"); }
    },
    joinRoom(roomCode, displayName) {
      const room = settleRoom(roomCode);
      if (!room) return failure("ROOM_NOT_FOUND");
      const name = normalizeName(displayName);
      if (!name) return failure("INVALID_NAME");
      if (room.game) return failure("ROOM_STARTED");
      if ([...room.seats.values()].some((seat) => seat.name.toLowerCase() === name.toLowerCase())) return failure("DUPLICATE_NAME");
      if (room.seats.size >= 6) return failure("ROOM_FULL");
      try {
        const seat = newSeat(name);
        if (!seat) return failure("INTERNAL_ERROR");
        const credentials = retainSeat(room, seat);
        commit(room);
        flush();
        return { ok: true, value: credentials };
      } catch { return failure("INTERNAL_ERROR"); }
    },
    connect(roomCode, token, peer) {
      const room = settleRoom(roomCode);
      if (!room) return failure("ROOM_NOT_FOUND");
      const seat = typeof token === "string" ? [...room.seats.values()].find((seat) => seat.token === token) : undefined;
      if (!seat) return failure("INVALID_TOKEN");
      if (seat.reconnectDeadline !== null && deps.now() >= seat.reconnectDeadline) {
        expireDueSeats(room);
        return failure("INVALID_TOKEN");
      }
      const old = seat.peer;
      cancelExpiry(seat);
      seat.peer = peer;
      if (old && old !== peer) closePeer(old);
      commit(room, { version: 1, type: "lifecycle", event: "player-connected", playerId: seat.id });
      flush();
      return { ok: true, value: { playerId: seat.id } };
    },
    disconnect,
    handleCommand(roomCode, playerId, input) {
      const room = settleRoom(roomCode);
      if (!room) return failure("ROOM_NOT_FOUND");
      const seat = room.seats.get(playerId);
      if (!seat) return failure("PLAYER_NOT_FOUND", room.revision);
      const parsed = parseClientMessage(input);
      if (!parsed.ok) return failure(parsed.code, room.revision);
      const { command, commandId, revision } = parsed.value;
      if (seat.commands.has(commandId)) return failure("DUPLICATE_COMMAND", room.revision);
      if (revision !== room.revision) return failure("STALE_REVISION", room.revision);
      if (command.type === "start-game") {
        if (room.game) return failure("ROOM_STARTED", room.revision);
        if (room.hostPlayerId !== playerId) return failure("NOT_HOST", room.revision);
        if (room.seats.size < 2) return failure("NOT_ENOUGH_PLAYERS", room.revision);
        try {
          const deck = shuffleDeck(createDeck(deps.cardIdFactory), deps.random);
          room.game = createGameState({ playerIds: [...room.seats.keys()], deck, dealerIndex: Math.floor(deps.random() * room.seats.size) });
          room.game.players = room.game.players.map((player) => ({ ...player, name: room.seats.get(player.id)!.name }));
        } catch { return failure("INTERNAL_ERROR", room.revision); }
      } else if (command.type === "start-next-round") {
        if (room.hostPlayerId !== playerId) return failure("NOT_HOST", room.revision);
        return failure("round-not-complete", room.revision);
      } else if (command.type === "leave-room") {
        removeSeat(room, seat);
      } else {
        if (!room.game) return failure("invalid-phase", room.revision);
        const transition = applyGameCommand(room.game, { ...command, playerId });
        if (!transition.ok) return failure(transition.code, room.revision);
        room.game = transition.state;
      }
      seat.commands.add(commandId);
      const nextRevision = commit(room);
      flush();
      return { ok: true, value: { revision: nextRevision } };
    },
    getRoom(roomCode): RoomInspection | null {
      const room = roomFor(roomCode);
      if (!room) return null;
      return structuredClone({
        roomCode: room.code, hostPlayerId: room.hostPlayerId, revision: room.revision,
        players: [...room.seats.values()].map((seat) => ({ id: seat.id, name: seat.name, online: Boolean(seat.peer), reconnectDeadline: seat.reconnectDeadline })),
        game: room.game ? gameWithMetadata(room) : null,
      });
    },
  };
}
