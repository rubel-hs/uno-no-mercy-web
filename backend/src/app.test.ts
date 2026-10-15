import { describe, expect, test } from "bun:test";

import { createApp } from "./app";

const config = {
  port: 3000,
  corsOrigins: ["http://localhost:5173"],
};

describe("createApp", () => {
  test("returns the health contract", async () => {
    const response = await createApp(config).request("/api/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "uno-no-mercy-api",
    });
  });

  test("returns status and endpoints on root GET /", async () => {
    const response = await createApp(config).request("/");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "uno-no-mercy-api",
      message: "UNO No Mercy API is running",
      endpoints: {
        health: "/api/health",
        createRoom: "/api/rooms",
      },
    });
  });

  test("allows configured browser origins", async () => {
    const response = await createApp(config).request("/api/health", {
      headers: { Origin: "http://localhost:5173" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
  });

  test("does not allow unconfigured browser origins", async () => {
    const response = await createApp(config).request("/api/health", {
      headers: { Origin: "https://untrusted.example" },
    });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("returns JSON for unknown routes", async () => {
    const response = await createApp(config).request("/missing");

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ error: "Not found" });
  });

  test("permits JSON room POST preflight from configured browser origins", async () => {
    const response = await createApp(config).request("/api/rooms", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "Content-Type",
      },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(response.headers.get("access-control-allow-methods")?.split(/,\s*/)).toEqual(["GET", "POST", "OPTIONS"]);
    expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("content-type");
  });

  test("does not grant preflight origin access to unconfigured origins", async () => {
    const response = await createApp(config).request("/api/rooms/ABCDEF/players", {
      method: "OPTIONS",
      headers: { Origin: "https://untrusted.example", "Access-Control-Request-Method": "POST" },
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  test("preserves no-argument application construction", async () => {
    expect((await createApp().request("/api/health")).status).toBe(200);
  });

  test("default stores persist across requests and stay isolated between apps", async () => {
    const app = createApp(config);
    const created = await app.request("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"displayName":"Host"}' });
    expect(created.status).toBe(201);
    const { roomCode } = await created.json() as { roomCode: string };
    const request = { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"displayName":"Guest"}' };
    expect((await app.request(`/api/rooms/${roomCode}/players`, request)).status).toBe(201);
    expect((await createApp(config).request(`/api/rooms/${roomCode}/players`, request)).status).toBe(404);
  });
});
