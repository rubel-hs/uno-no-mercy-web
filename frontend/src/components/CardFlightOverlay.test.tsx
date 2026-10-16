import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { cardBack, findCard } from "../game/cards";
import { CardFlightOverlay, isReducedMotionActive, type FlightRequest } from "./CardFlightOverlay";

describe("CardFlightOverlay", () => {
  it("renders active card flights in a fixed overlay layer", () => {
    const onFlightEnd = vi.fn();
    const flight: FlightRequest = {
      id: "f1",
      card: findCard("red-7"),
      fromRect: { x: 100, y: 100, width: 80, height: 120 },
      toRect: { x: 300, y: 200, width: 80, height: 120 },
      duration: 0.28,
      onComplete: vi.fn(),
    };

    render(<CardFlightOverlay flights={[flight]} onFlightEnd={onFlightEnd} />);
    const overlay = screen.getByTestId("card-flight-overlay");
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveClass(
      "pointer-events-none",
      "fixed",
      "inset-0",
      "z-50",
      "overflow-hidden",
    );
    expect(screen.getByRole("article", { name: /red 7/i })).toBeInTheDocument();
  });

  it("renders multiple flights and card backs", () => {
    const onFlightEnd = vi.fn();
    const flights: FlightRequest[] = [
      {
        id: "f1",
        card: findCard("blue-0"),
        fromRect: { x: 50, y: 50, width: 80, height: 120 },
        toRect: { x: 200, y: 150, width: 80, height: 120 },
      },
      {
        id: "f2",
        card: cardBack,
        fromRect: { x: 100, y: 100, width: 80, height: 120 },
        toRect: { x: 300, y: 200, width: 80, height: 120 },
        delay: 0.08,
      },
    ];

    render(<CardFlightOverlay flights={flights} onFlightEnd={onFlightEnd} />);
    expect(screen.getByRole("article", { name: /blue 0/i })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: /card back/i })).toBeInTheDocument();
  });

  it("fires completion callbacks when animation finishes", async () => {
    const onFlightEnd = vi.fn();
    const onComplete = vi.fn();
    const flight: FlightRequest = {
      id: "f1",
      card: findCard("red-7"),
      fromRect: { x: 100, y: 100, width: 80, height: 120 },
      toRect: { x: 300, y: 200, width: 80, height: 120 },
      duration: 0.01,
      onComplete,
    };

    render(<CardFlightOverlay flights={[flight]} onFlightEnd={onFlightEnd} />);

    await waitFor(() => {
      expect(onFlightEnd).toHaveBeenCalledWith("f1");
      expect(onComplete).toHaveBeenCalled();
    });
  });

  it("completes immediately when prefers-reduced-motion is active", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    try {
      const onFlightEnd = vi.fn();
      const onComplete = vi.fn();
      const flight: FlightRequest = {
        id: "f-reduced",
        card: findCard("green-5"),
        fromRect: { x: 10, y: 10, width: 80, height: 120 },
        toRect: { x: 200, y: 200, width: 80, height: 120 },
        duration: 1.0,
        delay: 0.5,
        onComplete,
      };

      render(<CardFlightOverlay flights={[flight]} onFlightEnd={onFlightEnd} />);

      await waitFor(() => {
        expect(onFlightEnd).toHaveBeenCalledWith("f-reduced");
        expect(onComplete).toHaveBeenCalled();
      });
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  describe("isReducedMotionActive helper", () => {
    it("returns true immediately if motionReduced hook returned true", () => {
      expect(isReducedMotionActive(true)).toBe(true);
    });

    it("checks window.matchMedia('(prefers-reduced-motion: reduce)') when hook returns false or null", () => {
      const originalMatchMedia = window.matchMedia;
      const matchMediaMock = vi.fn().mockImplementation((query: string) => ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
      }));
      window.matchMedia = matchMediaMock;

      try {
        expect(isReducedMotionActive(false)).toBe(true);
        expect(isReducedMotionActive(null)).toBe(true);
        expect(matchMediaMock).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it("returns false when prefers-reduced-motion does not match", () => {
      const originalMatchMedia = window.matchMedia;
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
      }));

      try {
        expect(isReducedMotionActive(false)).toBe(false);
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });

    it("safely returns false when matchMedia is not a function", () => {
      const originalMatchMedia = window.matchMedia;
      // @ts-expect-error testing undefined matchMedia
      window.matchMedia = undefined;

      try {
        expect(isReducedMotionActive(false)).toBe(false);
        expect(isReducedMotionActive(null)).toBe(false);
      } finally {
        window.matchMedia = originalMatchMedia;
      }
    });
  });
});
