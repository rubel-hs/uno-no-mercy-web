import type {
  ClientCommand,
  ClientEnvelope,
  CommandErrorCode,
  PlayerSnapshot,
  RoomCredentials,
  ServerMessage,
} from "../game/protocol";
import { clearSession } from "../game/session";

export interface GameSocketOptions {
  credentials: RoomCredentials;
  apiBaseUrl?: string;
  onSnapshot: (snapshot: PlayerSnapshot) => void;
  onRejection?: (rejection: {
    code: CommandErrorCode;
    message: string;
    commandId?: string;
    revision?: number;
  }) => void;
  onLifecycle?: (event: { event: string; playerId?: string }) => void;
  onConnectionStateChange?: (
    state: "connecting" | "connected" | "reconnecting" | "closed",
    attempt?: number,
  ) => void;
  onForfeit?: () => void;
  WebSocketClass?: typeof WebSocket;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
  commandIdFactory?: () => string;
}

export interface GameSocketClient {
  send(command: ClientCommand): string;
  leave(): void;
  close(): void;
}

const DEFAULT_API_URL = "http://localhost:3000";
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_INTERVAL_MS = 5_000;

function deriveWebSocketUrl(apiBaseUrl: string | undefined, roomCode: string): string {
  const base = (apiBaseUrl || import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(
    /\/+$/,
    "",
  );
  const wsBase = base.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
  return `${wsBase}/api/rooms/${encodeURIComponent(roomCode.toUpperCase())}/socket`;
}

export function createGameSocket(options: GameSocketOptions): GameSocketClient {
  const {
    credentials,
    apiBaseUrl,
    onSnapshot,
    onRejection,
    onLifecycle,
    onConnectionStateChange,
    onForfeit,
    WebSocketClass = WebSocket,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    commandIdFactory = () => crypto.randomUUID(),
  } = options;

  let currentSocket: WebSocket | null = null;
  let currentRevision = 0;
  let intentionalClose = false;
  let isClosed = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let forfeited = false;

  const url = deriveWebSocketUrl(apiBaseUrl, credentials.roomCode);

  function cleanupTimer(): void {
    if (reconnectTimer !== null) {
      clearTimeoutFn(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function connect(): void {
    if (intentionalClose || isClosed) return;

    if (reconnectAttempt > 0) {
      onConnectionStateChange?.("reconnecting", reconnectAttempt);
    } else {
      onConnectionStateChange?.("connecting");
    }

    const socket = new WebSocketClass(url);
    currentSocket = socket;

    socket.addEventListener("open", () => {
      if (socket !== currentSocket) return;
      socket.send(
        JSON.stringify({
          version: 1,
          type: "authenticate",
          token: credentials.token,
        }),
      );
    });

    socket.addEventListener("message", (event) => {
      if (socket !== currentSocket) return;
      try {
        const message = JSON.parse(String(event.data)) as ServerMessage;
        if (message.type === "snapshot") {
          currentRevision = message.snapshot.revision;
          if (reconnectAttempt > 0) {
            reconnectAttempt = 0;
            cleanupTimer();
            onConnectionStateChange?.("connected");
          }
          onSnapshot(message.snapshot);
        } else if (message.type === "rejection") {
          onRejection?.({
            code: message.code,
            message: message.message,
            commandId: message.commandId,
            revision: message.revision,
          });
        } else if (message.type === "lifecycle") {
          onLifecycle?.({
            event: message.event,
            playerId: message.playerId,
          });
        }
      } catch {
        // Discard unparseable server messages
      }
    });

    socket.addEventListener("close", (event) => {
      if (socket !== currentSocket) return;
      if (intentionalClose || isClosed) return;

      // Unexpected close: handle reconnect lifecycle
      handleUnexpectedClose();
    });

    socket.addEventListener("error", () => {
      // The error event is always followed by a close event in standard WebSocket
    });
  }

  function handleUnexpectedClose(): void {
    if (intentionalClose || isClosed || forfeited) return;

    if (reconnectAttempt >= MAX_RECONNECT_ATTEMPTS) {
      // Retries exhausted
      forfeited = true;
      isClosed = true;
      cleanupTimer();
      clearSession();
      onConnectionStateChange?.("closed");
      onForfeit?.();
      return;
    }

    reconnectAttempt++;
    // Attempt 1 starts immediately; attempts 2-10 wait 5,000ms
    if (reconnectAttempt === 1) {
      connect();
    } else {
      onConnectionStateChange?.("reconnecting", reconnectAttempt);
      reconnectTimer = setTimeoutFn(() => {
        reconnectTimer = null;
        connect();
      }, RECONNECT_INTERVAL_MS);
    }
  }

  function sendCommand(command: ClientCommand): string {
    const commandId = commandIdFactory();
    const envelope: ClientEnvelope = {
      version: 1,
      type: "command",
      commandId,
      revision: currentRevision,
      command,
    };

    if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
      currentSocket.send(JSON.stringify(envelope));
    }
    return commandId;
  }

  // Start the initial connection
  connect();

  return {
    send(command: ClientCommand): string {
      return sendCommand(command);
    },
    leave(): void {
      intentionalClose = true;
      isClosed = true;
      cleanupTimer();
      sendCommand({ type: "leave-room" });
      if (currentSocket) {
        try {
          currentSocket.close(1000, "Left room");
        } catch {
          // Ignore
        }
      }
      onConnectionStateChange?.("closed");
    },
    close(): void {
      intentionalClose = true;
      isClosed = true;
      cleanupTimer();
      if (currentSocket) {
        try {
          currentSocket.close(1000, "Closed");
        } catch {
          // Ignore
        }
      }
      onConnectionStateChange?.("closed");
    },
  };
}
