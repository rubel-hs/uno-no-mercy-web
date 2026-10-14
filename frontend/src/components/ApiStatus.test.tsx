import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { getHealth } from "../api/health";
import { ApiStatus } from "./ApiStatus";

vi.mock("../api/health", () => ({
  getHealth: vi.fn(),
}));

const getHealthMock = vi.mocked(getHealth);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ApiStatus", () => {
  test("shows the checking state while the request is pending", () => {
    getHealthMock.mockReturnValue(new Promise(() => undefined));

    render(<ApiStatus />);

    expect(screen.getByText("Checking backend…")).toBeInTheDocument();
  });

  test("shows the connected state after a healthy response", async () => {
    getHealthMock.mockResolvedValue({
      status: "ok",
      service: "uno-no-mercy-api",
    });

    render(<ApiStatus />);

    expect(await screen.findByText("Backend connected")).toBeInTheDocument();
  });

  test("shows the unavailable state after a failed request", async () => {
    getHealthMock.mockRejectedValue(new Error("network unavailable"));

    render(<ApiStatus />);

    expect(
      await screen.findByText("Backend unavailable"),
    ).toBeInTheDocument();
  });
});
