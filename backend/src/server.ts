import { createApp } from "./app";
import { type AppConfig, loadConfig } from "./config/env";
import { websocket } from "./modules/realtime/realtime.route";

export function startServer(config: AppConfig = loadConfig()) {
  const app = createApp(config);
  return Bun.serve({
    port: config.port,
    fetch: app.fetch,
    websocket,
  });
}

if (import.meta.main) {
  const server = startServer();
  console.log(`UNO No Mercy API listening on http://localhost:${server.port}`);
}
