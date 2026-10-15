import { afterEach, describe, expect, test, vi } from "vitest";
import { createRoom, joinRoom, RoomApiError } from "./rooms";

const credentialsFixture = {
  roomCode: "ABCDEF",
  playerId: "player-1",
  token: "secret-token-123",
};

function stubFetch(response: Response) {
  const fetchStub = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("rooms API client", () => {
  describe("createRoom", () => {
    test.each(["http://localhost:3000", "http://localhost:3000/"])(
      "posts to normalized /api/rooms from %s",
      async (baseUrl) => {
        const fetchStub = stubFetch(Response.json(credentialsFixture, { status: 201 }));

        const result = await createRoom("Alice", baseUrl);

        expect(fetchStub).toHaveBeenCalledWith("http://localhost:3000/api/rooms", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: "Alice" }),
        });
        expect(result).toEqual(credentialsFixture);
      },
    );

    test("trims the display name before sending", async () => {
      const fetchStub = stubFetch(Response.json(credentialsFixture, { status: 201 }));

      await createRoom("   Bob   ", "http://localhost:3000");

      expect(fetchStub).toHaveBeenCalledWith("http://localhost:3000/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Bob" }),
      });
    });

    test("throws structured RoomApiError on server error response", async () => {
      stubFetch(
        Response.json(
          { error: { code: "INVALID_NAME", message: "Enter a name between 1 and 24 characters." } },
          { status: 400 },
        ),
      );

      const promise = createRoom("", "http://localhost:3000");
      await expect(promise).rejects.toThrow("Enter a name between 1 and 24 characters.");
      await expect(promise).rejects.toBeInstanceOf(RoomApiError);
      await promise.catch((error: RoomApiError) => {
        expect(error.code).toBe("INVALID_NAME");
        expect(error.status).toBe(400);
      });
    });

    test("falls back safely on non-JSON failure", async () => {
      stubFetch(new Response("Bad Gateway", { status: 502, statusText: "Bad Gateway" }));

      const promise = createRoom("Alice", "http://localhost:3000");
      await expect(promise).rejects.toThrow("Bad Gateway");
      await promise.catch((error: RoomApiError) => {
        expect(error.code).toBe("INTERNAL_ERROR");
        expect(error.status).toBe(502);
      });
    });
  });

  describe("joinRoom", () => {
    test.each(["http://localhost:3000", "http://localhost:3000/"])(
      "posts to normalized /api/rooms/:roomCode/players from %s",
      async (baseUrl) => {
        const fetchStub = stubFetch(Response.json(credentialsFixture, { status: 201 }));

        const result = await joinRoom("abcdef", "Charlie", baseUrl);

        expect(fetchStub).toHaveBeenCalledWith("http://localhost:3000/api/rooms/ABCDEF/players", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ displayName: "Charlie" }),
        });
        expect(result).toEqual(credentialsFixture);
      },
    );

    test("throws structured RoomApiError when room is not found", async () => {
      stubFetch(
        Response.json(
          { error: { code: "ROOM_NOT_FOUND", message: "Room not found." } },
          { status: 404 },
        ),
      );

      const promise = joinRoom("ABCDEF", "Charlie", "http://localhost:3000");
      await expect(promise).rejects.toThrow("Room not found.");
      await promise.catch((error: RoomApiError) => {
        expect(error.code).toBe("ROOM_NOT_FOUND");
        expect(error.status).toBe(404);
      });
    });

    test("throws structured RoomApiError when name is duplicate", async () => {
      stubFetch(
        Response.json(
          { error: { code: "DUPLICATE_NAME", message: "That name is already in use." } },
          { status: 409 },
        ),
      );

      const promise = joinRoom("ABCDEF", "Alice", "http://localhost:3000");
      await expect(promise).rejects.toThrow("That name is already in use.");
      await promise.catch((error: RoomApiError) => {
        expect(error.code).toBe("DUPLICATE_NAME");
        expect(error.status).toBe(409);
      });
    });
  });
});
