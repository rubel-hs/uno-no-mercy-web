import { createApp } from "./app";
import { loadConfig } from "./config/env";

const config = loadConfig();
const app = createApp(config);

Bun.serve({
  port: config.port,
  fetch: app.fetch,
});

console.log(`UNO No Mercy API listening on http://localhost:${config.port}`);
