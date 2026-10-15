import type { RoomCredentials } from "./protocol";

export const SESSION_STORAGE_KEY = "uno-no-mercy:session:v1";

function isValidString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function saveSession(credentials: RoomCredentials): void {
  const safeData: RoomCredentials = {
    roomCode: credentials.roomCode,
    playerId: credentials.playerId,
    token: credentials.token,
  };
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(safeData));
  } catch {
    // Ignore storage quota or disabled storage errors
  }
}

export function loadSession(): RoomCredentials | null {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (
      data !== null &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      isValidString(data.roomCode) &&
      isValidString(data.playerId) &&
      isValidString(data.token)
    ) {
      return {
        roomCode: data.roomCode,
        playerId: data.playerId,
        token: data.token,
      };
    }

    // Malformed session data: discard
    clearSession();
    return null;
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}
