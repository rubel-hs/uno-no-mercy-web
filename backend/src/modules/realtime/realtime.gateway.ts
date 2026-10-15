import { parseClientMessage, type CommandErrorCode, type ServerMessage } from "../game/game.protocol";
import type { RoomPeer, RoomStore } from "../rooms/room.types";

const MAX_MESSAGE_BYTES = 16_384;
const encoder = new TextEncoder();
const rejectionMessages: Record<CommandErrorCode, string> = {
  INVALID_MESSAGE: "Invalid client message.",
  ROOM_NOT_FOUND: "Room not found.",
  ROOM_CLOSED: "This room is closed.",
  ROOM_FULL: "This room is full.",
  ROOM_STARTED: "This game has already started.",
  INVALID_NAME: "Enter a name between 1 and 24 characters.",
  DUPLICATE_NAME: "That name is already in use.",
  INVALID_TOKEN: "The player session is invalid or expired.",
  NOT_AUTHENTICATED: "Authenticate before sending commands.",
  NOT_HOST: "Only the host can start the game.",
  NOT_ENOUGH_PLAYERS: "At least two players are required.",
  PLAYER_NOT_FOUND: "The player is no longer in this room.",
  STALE_REVISION: "The room changed. Use the latest snapshot.",
  DUPLICATE_COMMAND: "This command was already accepted.",
  INTERNAL_ERROR: "The request could not be completed.",
  "out-of-turn": "It is not your turn.",
  "card-not-in-hand": "That card is not in your hand.",
  "illegal-play": "That card cannot be played now.",
  "playable-card-in-hand": "Play an available card before drawing.",
  "deck-exhausted": "No more cards can be drawn.",
  "invalid-phase": "That action is not available now.",
  "invalid-target": "Choose an available player.",
  "uno-unavailable": "That UNO action is not available now.",
  "unsupported-command": "That action is not supported.",
};

function authenticationToken(value: unknown): string | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const message = value as Record<string, unknown>;
  if (Object.keys(message).length !== 3 || !Object.hasOwn(message, "version") || !Object.hasOwn(message, "type") ||
    !Object.hasOwn(message, "token") || message.version !== 1 || message.type !== "authenticate" ||
    typeof message.token !== "string" || message.token.trim().length === 0) return null;
  return message.token;
}

export interface RealtimeSession {
  onMessage(data: unknown): void;
  onClose(): void;
}

/** Owns one transport lifetime. Store callbacks can close it before connect returns. */
export function createRealtimeSession(store: RoomStore, roomCode: string, peer: RoomPeer): RealtimeSession {
  let playerId: string | undefined;
  let authenticating = false;
  let closed = false;
  let needsDisconnect = false;
  let disconnected = false;

  function disconnectBoundPeer(): void {
    if (!needsDisconnect || disconnected || playerId === undefined) return;
    disconnected = true;
    try { store.disconnect(roomCode, playerId, peer.id); }
    catch { console.error("Unexpected realtime store exception during disconnect."); }
  }

  function terminate(code: number, reason: string, unexpected = true): void {
    if (closed) return;
    closed = true;
    needsDisconnect = unexpected;
    disconnectBoundPeer();
    try { peer.close(code, reason); } catch { /* The transport may already be gone. */ }
  }

  function send(message: ServerMessage): void {
    if (closed) return;
    try { peer.send(message); }
    catch { terminate(1011, "Connection unavailable"); }
  }

  function reject(errorCode: CommandErrorCode, commandId?: string, revision?: number): void {
    // Store diagnostics and exceptions may contain credentials. Only static public
    // messages and explicitly validated metadata cross this boundary.
    const code = Object.hasOwn(rejectionMessages, errorCode) ? errorCode : "INTERNAL_ERROR";
    send({
      version: 1, type: "rejection", code, message: rejectionMessages[code],
      ...(commandId === undefined ? {} : { commandId }),
      ...(typeof revision === "number" && Number.isSafeInteger(revision) && revision >= 0 ? { revision } : {}),
    });
  }

  function invalidMessage(): void {
    reject("INVALID_MESSAGE");
    if (playerId === undefined) terminate(1008, "Authentication required");
  }

  const boundPeer: RoomPeer = {
    id: peer.id,
    send,
    // The store has already removed or replaced this binding. Mark the old
    // session terminal immediately, even before the physical close event arrives.
    close: () => terminate(1000, "Player session closed", false),
  };

  return {
    onMessage(raw) {
      if (closed || authenticating) return;
      // Never decode binary frames. The cheap character check also avoids a large
      // temporary encoding allocation; multibyte text still uses its UTF-8 size.
      if (typeof raw !== "string" || raw.length > MAX_MESSAGE_BYTES || encoder.encode(raw).byteLength > MAX_MESSAGE_BYTES) {
        invalidMessage();
        return;
      }
      let message: unknown;
      try { message = JSON.parse(raw); }
      catch { invalidMessage(); return; }

      if (playerId === undefined) {
        const token = authenticationToken(message);
        if (token === null) { invalidMessage(); return; }
        authenticating = true;
        try {
          const result = store.connect(roomCode, token, boundPeer);
          if (!result.ok) {
            reject(result.code);
            terminate(1008, "Authentication failed");
            return;
          }
          playerId = result.value.playerId;
          // A failed initial snapshot send can terminate during store.connect().
          // Release the binding as soon as the authenticated identity is known.
          disconnectBoundPeer();
        } catch {
          console.error("Unexpected realtime store exception during connect.");
          reject("INTERNAL_ERROR");
          terminate(1011, "Connection unavailable");
        } finally { authenticating = false; }
        return;
      }

      const parsed = parseClientMessage(message);
      if (!parsed.ok) { invalidMessage(); return; }
      const envelope = parsed.value;
      try {
        const result = store.handleCommand(roomCode, playerId, envelope);
        if (!result.ok) reject(result.code, envelope.commandId, result.revision);
        else if (envelope.command.type === "leave-room") terminate(1000, "Player session closed", false);
      } catch {
        console.error("Unexpected realtime store exception during handleCommand.");
        reject("INTERNAL_ERROR", envelope.commandId);
      }
    },
    onClose() {
      if (closed) return;
      closed = true;
      needsDisconnect = true;
      disconnectBoundPeer();
    },
  };
}
