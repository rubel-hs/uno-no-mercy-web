import type { CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";

import type { CardDefinition } from "../game/cards";
import { GameCard } from "./GameCard";

export interface FlightRequest {
  id: string;
  card: CardDefinition;
  fromRect: { x: number; y: number; width: number; height: number };
  toRect: { x: number; y: number; width: number; height: number };
  duration?: number;
  delay?: number;
  onComplete?: () => void;
}

export interface CardFlightOverlayProps {
  flights: FlightRequest[];
  onFlightEnd: (id: string) => void;
}

const DEFAULT_FLIGHT_DURATION = 0.28;
const FLIGHT_EASING = [0.22, 1, 0.36, 1] as const;

export function isReducedMotionActive(motionReduced: boolean | null): boolean {
  if (motionReduced) {
    return true;
  }
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return (
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      window.matchMedia("(prefers-reduced-motion)").matches
    );
  }
  return false;
}

export function CardFlightOverlay({
  flights,
  onFlightEnd,
}: CardFlightOverlayProps) {
  const motionReduced = useReducedMotion();
  const shouldReduceMotion = isReducedMotionActive(motionReduced);

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
      data-testid="card-flight-overlay"
    >
      {flights.map((flight) => {
        const duration = shouldReduceMotion ? 0 : (flight.duration ?? DEFAULT_FLIGHT_DURATION);
        const delay = shouldReduceMotion ? 0 : (flight.delay ?? 0);

        const toScale =
          flight.fromRect.width > 0 && flight.toRect.width > 0
            ? flight.toRect.width / flight.fromRect.width
            : 1;

        return (
          <motion.div
            key={flight.id}
            animate={{
              opacity: 1,
              scale: toScale,
              x: flight.toRect.x,
              y: flight.toRect.y,
            }}
            data-testid={`card-flight-${flight.id}`}
            initial={{
              opacity: 0.9,
              scale: 1,
              x: flight.fromRect.x,
              y: flight.fromRect.y,
            }}
            onAnimationComplete={() => {
              flight.onComplete?.();
              onFlightEnd(flight.id);
            }}
            style={
              {
                height: flight.fromRect.height,
                left: 0,
                position: "absolute",
                top: 0,
                transformOrigin: "top left",
                width: flight.fromRect.width,
                "--card-w": `${flight.fromRect.width}px`,
              } as CSSProperties
            }
            transition={{
              delay,
              duration,
              ease: FLIGHT_EASING,
            }}
          >
            <GameCard alignFlat card={flight.card} pointerOnly />
          </motion.div>
        );
      })}
    </div>
  );
}
