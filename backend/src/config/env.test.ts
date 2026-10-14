import { describe, expect, test } from "bun:test";

import { loadConfig } from "./env";

describe("loadConfig", () => {
  test("uses localhost defaults when environment values are missing", () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      corsOrigins: ["http://localhost:5173"],
    });
  });

  test("accepts a valid TCP port", () => {
    expect(loadConfig({ PORT: "8080" }).port).toBe(8080);
  });

  test.each(["abc", "0", "70000"])(
    "falls back when PORT is %s",
    (port) => {
      expect(loadConfig({ PORT: port }).port).toBe(3000);
    },
  );

  test("trims configured CORS origins and removes empty entries", () => {
    expect(
      loadConfig({
        CORS_ORIGIN: " https://one.example, ,https://two.example ",
      }).corsOrigins,
    ).toEqual(["https://one.example", "https://two.example"]);
  });
});
