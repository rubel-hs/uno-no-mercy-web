import { Hono } from "hono";

import { type AppConfig, loadConfig } from "./config/env";
import { createCorsMiddleware } from "./middleware/cors";
import { healthRoutes } from "./modules/health/health.route";
import { realtimeRoutes } from "./modules/realtime/realtime.route";
import { createRoomRoutes } from "./modules/rooms/room.route";
import { createRoomStore } from "./modules/rooms/room.store";
import type { RoomStore } from "./modules/rooms/room.types";

export function createApp(config: AppConfig = loadConfig(), services: { roomStore?: RoomStore } = {}): Hono {
  const app = new Hono();
  const roomStore = services.roomStore ?? createRoomStore();

  // Socket upgrades enforce their own origin policy and must finish before
  // CORS middleware attempts to modify the upgrade response's headers.
  app.route("/api/rooms", realtimeRoutes(roomStore, config.corsOrigins));
  app.use("/api/*", createCorsMiddleware(config.corsOrigins));
  app.get("/", (context) =>
    context.json({
      status: "ok",
      service: "uno-no-mercy-api",
      message: "UNO No Mercy API is running",
      endpoints: {
        health: "/api/health",
        createRoom: "/api/rooms",
      },
    }),
  );
  app.route("/api/health", healthRoutes);
  app.route("/api/rooms", createRoomRoutes(roomStore));

  app.notFound((context) => context.json({ error: "Not found" }, 404));
  app.onError((error, context) => {
    console.error(error);
    return context.json({ error: "Internal server error" }, 500);
  });

  return app;
}
