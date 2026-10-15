import type { RoomCredentials } from "../game/protocol";

const DEFAULT_API_URL = "http://localhost:3000";

export class RoomApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "RoomApiError";
    this.code = code;
    this.status = status;
  }
}

function normalizeBaseUrl(apiBaseUrl?: string): string {
  const url = apiBaseUrl || import.meta.env.VITE_API_URL || DEFAULT_API_URL;
  return url.replace(/\/+$/, "");
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  let code = "INTERNAL_ERROR";
  let message = response.statusText || "Request failed";

  try {
    const data = (await response.json()) as { error?: { code?: string; message?: string } };
    if (data?.error?.code && typeof data.error.code === "string") {
      code = data.error.code;
    }
    if (data?.error?.message && typeof data.error.message === "string") {
      message = data.error.message;
    }
  } catch {
    // Non-JSON failure: use statusText fallback
  }

  throw new RoomApiError(code, message, response.status);
}

export async function createRoom(
  displayName: string,
  apiBaseUrl?: string,
): Promise<RoomCredentials> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const response = await fetch(`${baseUrl}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: displayName.trim() }),
  });

  return handleResponse<RoomCredentials>(response);
}

export async function joinRoom(
  roomCode: string,
  displayName: string,
  apiBaseUrl?: string,
): Promise<RoomCredentials> {
  const baseUrl = normalizeBaseUrl(apiBaseUrl);
  const normalizedRoomCode = roomCode.trim().toUpperCase();
  const response = await fetch(`${baseUrl}/api/rooms/${normalizedRoomCode}/players`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ displayName: displayName.trim() }),
  });

  return handleResponse<RoomCredentials>(response);
}
