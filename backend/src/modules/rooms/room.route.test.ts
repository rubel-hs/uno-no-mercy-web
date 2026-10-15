import { describe, expect, test } from "bun:test";
import { createApp } from "../../app";
import { createRoomStore } from "./room.store";
import type { RoomCredentials, RoomResult, RoomStoreDeps } from "./room.types";

const config = { port: 3000, corsOrigins: ["http://localhost:5173"] };

function value<T>(result: RoomResult<T>): T {
  if (!result.ok) throw new Error(`Expected success, got ${result.code}`);
  return result.value;
}

function fixture(overrides: Partial<RoomStoreDeps> = {}) {
  let codes = 0;
  let tokens = 0;
  const store = createRoomStore({
    roomCodeFactory: () => ["ABCDEF", "GHJKLM", "NPQRST"][codes++]!,
    tokenFactory: () => `private-token-${++tokens}`,
    now: () => 1_000,
    setTimeout: () => 0,
    clearTimeout: () => {},
    ...overrides,
  });
  const app = createApp(config, { roomStore: store });
  const post = (path: string, body: string, contentType = "application/json") => app.request(path, {
    method: "POST", headers: { "Content-Type": contentType }, body,
  });
  return { store, app, post };
}

async function rejection(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get("content-type")).toContain("application/json");
  const body = await response.json();
  expect(body).toEqual({ error: { code, message: expect.any(String) } });
  return body;
}

describe("room REST contract", () => {
  test("creates a host and joins the same injected store with caller credentials only", async () => {
    const { store, post } = fixture();
    const created = await post("/api/rooms", '{"displayName":"  Alice  "}');
    expect(created.status).toBe(201);
    const host = await created.json() as RoomCredentials;
    expect(host).toEqual({ roomCode: "ABCDEF", playerId: expect.any(String), token: "private-token-1" });
    expect(host.playerId.length).toBeGreaterThan(0);
    expect(store.getRoom("ABCDEF")?.players).toMatchObject([{ id: host.playerId, name: "Alice" }]);

    const joined = await post("/api/rooms/abcdef/players?source=browser", '{"displayName":"Bob"}');
    expect(joined.status).toBe(201);
    const guest = await joined.json() as RoomCredentials;
    expect(guest).toEqual({ roomCode: "ABCDEF", playerId: expect.any(String), token: "private-token-2" });
    expect(guest.playerId).not.toBe(host.playerId);
    expect(JSON.stringify(guest)).not.toContain(host.token);
    expect(store.getRoom("ABCDEF")?.players).toHaveLength(2);
  });

  const malformed: [string, string, string][] = [
    ["invalid JSON", '{"displayName":', "INVALID_REQUEST"],
    ["empty body", "", "INVALID_REQUEST"],
    ["null", "null", "INVALID_REQUEST"],
    ["array", '[{"displayName":"Alice"}]', "INVALID_REQUEST"],
    ["string", '"Alice"', "INVALID_REQUEST"],
    ["number", "42", "INVALID_REQUEST"],
    ["boolean", "true", "INVALID_REQUEST"],
    ["missing field", "{}", "INVALID_REQUEST"],
    ["wrong field", '{"name":"Alice"}', "INVALID_REQUEST"],
    ["extra field", '{"displayName":"Alice","token":"attacker"}', "INVALID_REQUEST"],
    ["prototype field", '{"displayName":"Alice","__proto__":{}}', "INVALID_REQUEST"],
    ["non-string name", '{"displayName":24}', "INVALID_NAME"],
    ["null name", '{"displayName":null}', "INVALID_NAME"],
    ["object name", '{"displayName":{}}', "INVALID_NAME"],
    ["blank name", '{"displayName":"   "}', "INVALID_NAME"],
    ["overlong name", JSON.stringify({ displayName: "x".repeat(25) }), "INVALID_NAME"],
  ];
  test.each(malformed)("rejects %s for creation without allocating a room", async (_, body, code) => {
    const { store, post } = fixture();
    await rejection(await post("/api/rooms", body), 400, code);
    expect(store.getRoom("ABCDEF")).toBeNull();
    expect(value(store.createRoom("Valid"))).toMatchObject({ roomCode: "ABCDEF", token: "private-token-1" });
  });
  test.each(malformed)("rejects %s for joining without changing membership or revision", async (_, body, code) => {
    const { store, post } = fixture();
    value(store.createRoom("Host"));
    const before = store.getRoom("ABCDEF");
    await rejection(await post("/api/rooms/ABCDEF/players", body), 400, code);
    expect(store.getRoom("ABCDEF")).toEqual(before);
    expect(value(store.joinRoom("ABCDEF", "Valid")).token).toBe("private-token-2");
  });

  test("accepts the 24-character name boundary and JSON with a charset", async () => {
    const { store, post } = fixture();
    const response = await post("/api/rooms", JSON.stringify({ displayName: "x".repeat(24) }), "application/json; charset=utf-8");
    expect(response.status).toBe(201);
    expect(store.getRoom("ABCDEF")?.players[0]?.name).toBe("x".repeat(24));
  });

  test.each(["text/plain", "application/x-www-form-urlencoded", "application/jsonp"])("rejects %s media type without allocating a room", async (contentType) => {
    const { store, post } = fixture();
    await rejection(await post("/api/rooms", '{"displayName":"Alice"}', contentType), 415, "UNSUPPORTED_MEDIA_TYPE");
    expect(store.getRoom("ABCDEF")).toBeNull();
  });

  test.each(["NPQRST", "bad", "%2F", "%ZZ"])("returns a safe not-found response for room URL %s", async (code) => {
    const { post } = fixture();
    await rejection(await post(`/api/rooms/${code}/players`, '{"displayName":"Alice"}'), 404, "ROOM_NOT_FOUND");
  });

  test("normalizes an encoded room code while preserving display-name case", async () => {
    const { store, post } = fixture();
    value(store.createRoom("Host"));
    const response = await post("/api/rooms/%61bcdef/players", '{"displayName":"  bOb  "}');
    expect(response.status).toBe(201);
    expect(store.getRoom("ABCDEF")?.players[1]?.name).toBe("bOb");
  });

  test("rejects duplicate names regardless of case without changing the room", async () => {
    const { store, post } = fixture();
    value(store.createRoom("Alice"));
    const before = store.getRoom("ABCDEF");
    await rejection(await post("/api/rooms/ABCDEF/players", '{"displayName":" alice "}'), 409, "DUPLICATE_NAME");
    expect(store.getRoom("ABCDEF")).toEqual(before);
  });

  test("rejects a seventh player without exposing or changing the room", async () => {
    const { store, post } = fixture();
    value(store.createRoom("Host"));
    for (let index = 1; index < 6; index++) value(store.joinRoom("ABCDEF", `Guest ${index}`));
    const before = store.getRoom("ABCDEF");
    await rejection(await post("/api/rooms/ABCDEF/players", '{"displayName":"Overflow"}'), 409, "ROOM_FULL");
    expect(store.getRoom("ABCDEF")).toEqual(before);
  });

  test("rejects joining a started game without leaking hidden state or changing it", async () => {
    const { store, post } = fixture();
    const host = value(store.createRoom("Host"));
    value(store.joinRoom("ABCDEF", "Guest"));
    value(store.handleCommand("ABCDEF", host.playerId, { version: 1, type: "command", commandId: "start", revision: 1, command: { type: "start-game" } }));
    const before = store.getRoom("ABCDEF");
    await rejection(await post("/api/rooms/ABCDEF/players", '{"displayName":"Late"}'), 409, "ROOM_STARTED");
    expect(store.getRoom("ABCDEF")).toEqual(before);
  });

  test("returns a safe server error when room-code allocation fails", async () => {
    const { store, post } = fixture({ roomCodeFactory: () => "ABCDEF" });
    value(store.createRoom("Host"));
    const before = store.getRoom("ABCDEF");
    await rejection(await post("/api/rooms", '{"displayName":"Other host"}'), 500, "INTERNAL_ERROR");
    expect(store.getRoom("ABCDEF")).toEqual(before);
  });

  test("returns a safe server error when joining cannot allocate a private token", async () => {
    const { store, post } = fixture({ tokenFactory: () => "private-token" });
    value(store.createRoom("Host"));
    const before = store.getRoom("ABCDEF");
    await rejection(await post("/api/rooms/ABCDEF/players", '{"displayName":"Guest"}'), 500, "INTERNAL_ERROR");
    expect(store.getRoom("ABCDEF")).toEqual(before);
  });

  test.each([
    ["GET", "/api/rooms"], ["PUT", "/api/rooms"], ["DELETE", "/api/rooms/ABCDEF/players"],
    ["POST", "/api/rooms/"], ["POST", "/api/rooms/ABCDEF/players/"],
    ["POST", "/api/Rooms"], ["POST", "/api/rooms/ABCDEF"], ["POST", "/api/rooms/ABCDEF/players/extra"],
  ])("does not mutate rooms for %s %s", async (method, path) => {
    const { store, app } = fixture();
    value(store.createRoom("Host"));
    const before = store.getRoom("ABCDEF");
    const response = await app.request(path, { method, ...(method === "GET" ? {} : { body: '{"displayName":"Guest"}', headers: { "Content-Type": "application/json" } }) });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Not found" });
    expect(store.getRoom("ABCDEF")).toEqual(before);
    expect(store.getRoom("GHJKLM")).toBeNull();
  });
});
