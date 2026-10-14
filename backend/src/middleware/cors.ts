import { cors } from "hono/cors";

export function createCorsMiddleware(origins: readonly string[]) {
  return cors({
    origin: (origin) => (origins.includes(origin) ? origin : undefined),
    allowMethods: ["GET", "OPTIONS"],
  });
}
