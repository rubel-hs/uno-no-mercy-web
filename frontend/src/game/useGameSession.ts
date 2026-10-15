import { useCallback, useEffect, useRef, useState } from "react";
import { createRoom, joinRoom } from "../api/rooms";
import { createGameSocket, type GameSocketClient } from "../api/gameSocket";
import type {
  ClientCommand,
  CommandErrorCode,
  PlayerSnapshot,
  RoomCredentials,
} from "./protocol";
import { clearSession, loadSession, saveSession } from "./session";

export interface GameSessionController {
  status: "idle" | "connecting" | "connected" | "reconnecting" | "closed";
  credentials: RoomCredentials | null;
  snapshot: PlayerSnapshot | null;
  latestRejection: {
    code: CommandErrorCode;
    message: string;
    commandId?: string;
    revision?: number;
  } | null;
  reconnectAttempt: number;
  create: (displayName: string) => Promise<void>;
  join: (roomCode: string, displayName: string) => Promise<void>;
  start: () => void;
  send: (command: ClientCommand) => string;
  leave: () => void;
}

export function useGameSession(): GameSessionController {
  const [credentials, setCredentials] = useState<RoomCredentials | null>(null);
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "reconnecting" | "closed"
  >("idle");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [latestRejection, setLatestRejection] = useState<{
    code: CommandErrorCode;
    message: string;
    commandId?: string;
    revision?: number;
  } | null>(null);

  const socketRef = useRef<GameSocketClient | null>(null);

  const connectSocket = useCallback((creds: RoomCredentials) => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setStatus("connecting");
    const socket = createGameSocket({
      credentials: creds,
      onSnapshot: (freshSnapshot) => {
        setSnapshot(freshSnapshot);
        setStatus("connected");
        setReconnectAttempt(0);
      },
      onRejection: (rejection) => {
        setLatestRejection(rejection);
      },
      onConnectionStateChange: (newState, attempt = 0) => {
        setStatus(newState);
        setReconnectAttempt(attempt);
      },
      onForfeit: () => {
        clearSession();
        setCredentials(null);
        setSnapshot(null);
        setStatus("closed");
      },
    });

    socketRef.current = socket;
  }, []);

  // Restore saved session on initial mount
  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setCredentials(saved);
      connectSocket(saved);
    }

    return () => {
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [connectSocket]);

  const create = useCallback(
    async (displayName: string) => {
      const creds = await createRoom(displayName);
      saveSession(creds);
      setCredentials(creds);
      connectSocket(creds);
    },
    [connectSocket],
  );

  const join = useCallback(
    async (roomCode: string, displayName: string) => {
      const creds = await joinRoom(roomCode, displayName);
      saveSession(creds);
      setCredentials(creds);
      connectSocket(creds);
    },
    [connectSocket],
  );

  const start = useCallback(() => {
    socketRef.current?.send({ type: "start-game" });
  }, []);

  const send = useCallback((command: ClientCommand): string => {
    return socketRef.current?.send(command) ?? "";
  }, []);

  const leave = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.leave();
      socketRef.current = null;
    }
    clearSession();
    setCredentials(null);
    setSnapshot(null);
    setStatus("idle");
    setReconnectAttempt(0);
    setLatestRejection(null);
  }, []);

  return {
    status,
    credentials,
    snapshot,
    latestRejection,
    reconnectAttempt,
    create,
    join,
    start,
    send,
    leave,
  };
}
