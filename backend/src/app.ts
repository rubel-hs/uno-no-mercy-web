import { Hono } from "hono";

import { type AppConfig, loadConfig } from "./config/env";
import { createCorsMiddleware } from "./middleware/cors";
import { healthRoutes } from "./modules/health/health.route";

export function createApp(config: AppConfig = loadConfig()): Hono {
  const app = new Hono();

  app.use("/api/*", createCorsMiddleware(config.corsOrigins));
  app.route("/api/health", healthRoutes);

  app.notFound((context) => context.json({ error: "Not found" }, 404));
  app.onError((error, context) => {
    console.error(error);
    return context.json({ error: "Internal server error" }, 500);
  });

  return app;
}
