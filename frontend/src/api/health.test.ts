import { afterEach, describe, expect, test, vi } from "vitest";

import { getHealth } from "./health";

const healthyResponse = {
  status: "ok",
  service: "uno-no-mercy-api",
} as const;

function stubFetch(response: Response) {
  const fetchStub = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchStub);
  return fetchStub;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getHealth", () => {
  test.each(["http://localhost:3000", "http://localhost:3000/"])(
    "requests one normalized health URL from %s",
    async (baseUrl) => {
      const fetchStub = stubFetch(Response.json(healthyResponse));

      await getHealth(baseUrl);

      expect(fetchStub).toHaveBeenCalledWith(
        "http://localhost:3000/api/health",
      );
    },
  );

  test("returns the backend health payload", async () => {
    stubFetch(Response.json(healthyResponse));

    await expect(getHealth("http://localhost:3000")).resolves.toEqual(
      healthyResponse,
    );
  });

  test("rejects unsuccessful health responses", async () => {
    stubFetch(new Response(null, { status: 503 }));

    await expect(getHealth("http://localhost:3000")).rejects.toThrow(
      "Backend health check failed",
    );
  });
});
