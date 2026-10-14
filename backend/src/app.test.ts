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
});
