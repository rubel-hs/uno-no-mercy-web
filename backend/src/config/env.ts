const DEFAULT_PORT = 3000;
const DEFAULT_CORS_ORIGIN = "http://localhost:5173";

export interface AppConfig {
  port: number;
  corsOrigins: string[];
}

function parsePort(value: string | undefined): number {
  const port = Number(value);

  return Number.isInteger(port) && port >= 1 && port <= 65_535
    ? port
    : DEFAULT_PORT;
}

function parseCorsOrigins(value: string | undefined): string[] {
  const origins = value
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins?.length ? origins : [DEFAULT_CORS_ORIGIN];
}

export function loadConfig(
  env: Record<string, string | undefined> = Bun.env,
): AppConfig {
  return {
    port: parsePort(env.PORT),
    corsOrigins: parseCorsOrigins(env.CORS_ORIGIN),
  };
}
