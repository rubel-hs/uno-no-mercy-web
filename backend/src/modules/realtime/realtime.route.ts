import { Hono } from "hono";
import { createBunWebSocket } from "hono/bun";
import type { RoomStore } from "../rooms/room.types";
import { createRealtimeSession, type RealtimeSession } from "./realtime.gateway";

const { upgradeWebSocket, websocket } = createBunWebSocket();
export { websocket };

function normalizeOrigin(value: string | undefined): string | null {
  if (!value || !/^https?:\/\/[^/?#]+\/?$/i.test(value) || /[\\\s]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function realtimeRoutes(store: RoomStore, allowedOrigins: readonly string[]): Hono {
  const routes = new Hono();
  const origins = new Set(allowedOrigins.map(normalizeOrigin).filter((origin) => origin !== null));
  routes.get("/:roomCode/socket", async (context) => {
    const origin = normalizeOrigin(context.req.header("Origin"));
    if (origin === null || !origins.has(origin)) {
      return context.json({ error: { code: "ORIGIN_NOT_ALLOWED", message: "This browser origin is not allowed." } }, 403);
    }
    const roomCode = context.req.param("roomCode").toUpperCase();
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(roomCode)) {
      return context.json({ error: { code: "ROOM_NOT_FOUND", message: "Room not found." } }, 404);
    }
    if (context.req.header("Upgrade")?.toLowerCase() !== "websocket") {
      return context.json({ error: { code: "UPGRADE_REQUIRED", message: "Use a WebSocket connection." } }, 426);
    }
    let session: RealtimeSession | undefined;
    try {
      return await upgradeWebSocket(context, {
        onOpen(_event, socket) {
          session = createRealtimeSession(store, roomCode, {
            id: crypto.randomUUID(),
            send: (message) => socket.send(JSON.stringify(message)),
            close: (code, reason) => socket.close(code, reason),
          });
        },
        onMessage: (event) => session?.onMessage(event.data),
        onClose: () => session?.onClose(),
      });
    } catch {
      console.error("Unexpected realtime WebSocket upgrade exception.");
      return context.json({ error: { code: "INTERNAL_ERROR", message: "The connection could not be established." } }, 500);
    }
  });
  return routes;
}
