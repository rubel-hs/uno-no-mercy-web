import { beforeEach, describe, expect, test } from "vitest";
import { clearSession, loadSession, saveSession, SESSION_STORAGE_KEY } from "./session";

const validCredentials = {
  roomCode: "ABCDEF",
  playerId: "player-123",
  token: "token-xyz-789",
};

describe("session storage client", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  test("returns null when no session is stored", () => {
    expect(loadSession()).toBeNull();
  });

  test("saves and loads valid credentials under the versioned key", () => {
    saveSession(validCredentials);

    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(
      JSON.stringify(validCredentials),
    );
    expect(loadSession()).toEqual(validCredentials);
  });

  test("persists only roomCode, playerId, and token, discarding extra fields", () => {
    const credentialsWithExtra = {
      ...validCredentials,
      extraField: "should-be-omitted",
      anotherOne: 12345,
    } as unknown as typeof validCredentials;

    saveSession(credentialsWithExtra);

    const storedRaw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    expect(storedRaw).toBe(JSON.stringify(validCredentials));
    expect(loadSession()).toEqual(validCredentials);
  });

  test("discards invalid JSON and returns null", () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, "not-valid-json{");

    expect(loadSession()).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  test.each([
    null,
    "string-value",
    123,
    [],
    {},
    { roomCode: "ABCDEF" },
    { roomCode: "ABCDEF", playerId: "p1" },
    { roomCode: "", playerId: "p1", token: "t1" },
    { roomCode: "ABCDEF", playerId: "", token: "t1" },
    { roomCode: "ABCDEF", playerId: "p1", token: "" },
    { roomCode: 123, playerId: "p1", token: "t1" },
  ])("discards malformed stored data %j and returns null", (malformed) => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(malformed));

    expect(loadSession()).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  test("clears the session from storage", () => {
    saveSession(validCredentials);
    expect(loadSession()).toEqual(validCredentials);

    clearSession();

    expect(loadSession()).toBeNull();
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
