import { Hono, type Context } from "hono";
import type { RoomCredentials, RoomResult, RoomStore } from "./room.types";

const MAX_BODY_BYTES = 1024;

function failure(context: Context, code: string) {
  // Only these public errors are possible in room setup. Never serialize a
  // store result, diagnostic message, revision, or exception to the browser.
  switch (code) {
    case "INVALID_REQUEST":
      return context.json({ error: { code, message: "Expected a JSON object with only displayName." } }, 400);
    case "UNSUPPORTED_MEDIA_TYPE":
      return context.json({ error: { code, message: "Use application/json." } }, 415);
    case "REQUEST_TOO_LARGE":
      return context.json({ error: { code, message: "Request body must not exceed 1024 bytes." } }, 413);
    case "INVALID_NAME":
      return context.json({ error: { code, message: "Enter a name between 1 and 24 characters." } }, 400);
    case "ROOM_NOT_FOUND":
      return context.json({ error: { code, message: "Room not found." } }, 404);
    case "DUPLICATE_NAME":
      return context.json({ error: { code, message: "That name is already in use." } }, 409);
    case "ROOM_FULL":
      return context.json({ error: { code, message: "This room is full." } }, 409);
    case "ROOM_STARTED":
      return context.json({ error: { code, message: "This game has already started." } }, 409);
    default:
      return context.json({ error: { code: "INTERNAL_ERROR", message: "The request could not be completed." } }, 500);
  }
}

async function parseName(context: Context): Promise<{ name: string } | { code: string }> {
  const mediaType = context.req.header("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") return { code: "UNSUPPORTED_MEDIA_TYPE" };
  let body: unknown;
  const reader = context.req.raw.body?.getReader();
  try {
    let bytes = 0;
    let text = "";
    const decoder = new TextDecoder();
    if (reader) {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        // Count bytes as they arrive; Content-Length is not authoritative.
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BODY_BYTES) {
          void reader.cancel().catch(() => {});
          return { code: "REQUEST_TOO_LARGE" };
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
    }
    body = JSON.parse(text + decoder.decode());
  }
  catch { return { code: "INVALID_REQUEST" }; }
  finally { reader?.releaseLock(); }
  if (body === null || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length !== 1 || !Object.hasOwn(body, "displayName")) return { code: "INVALID_REQUEST" };
  const name = (body as Record<string, unknown>).displayName;
  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 24) return { code: "INVALID_NAME" };
  return { name: name.trim() };
}

function respond(context: Context, result: RoomResult<RoomCredentials>) {
  if (!result.ok) return failure(context, result.code);
  const { roomCode, playerId, token } = result.value;
  return context.json({ roomCode, playerId, token }, 201);
}

export function createRoomRoutes(store: RoomStore): Hono {
  const routes = new Hono();
  routes.post("/", async (context) => {
    const input = await parseName(context);
    if ("code" in input) return failure(context, input.code);
    try { return respond(context, store.createRoom(input.name)); }
    catch {
      console.error("Unexpected room store exception during createRoom.");
      return failure(context, "INTERNAL_ERROR");
    }
  });
  routes.post("/:roomCode/players", async (context) => {
    const input = await parseName(context);
    if ("code" in input) return failure(context, input.code);
    try { return respond(context, store.joinRoom(context.req.param("roomCode"), input.name)); }
    catch {
      console.error("Unexpected room store exception during joinRoom.");
      return failure(context, "INTERNAL_ERROR");
    }
  });
  return routes;
}
