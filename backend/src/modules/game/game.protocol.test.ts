import { describe, expect, test } from "bun:test";
import type { PlayerSnapshot } from "./game.protocol";
import { parseClientMessage } from "./game.protocol";

describe("match protocol", () => {
  test("parses start-next-round", () => {
    expect(parseClientMessage({
      version: 1,
      type: "command",
      commandId: "next-round-1",
      revision: 12,
      command: { type: "start-next-round" },
    })).toEqual({
      ok: true,
      value: {
        version: 1,
        type: "command",
        commandId: "next-round-1",
        revision: 12,
        command: { type: "start-next-round" },
      },
    });
  });

  test("allows public match metadata on a player snapshot", () => {
    const snapshot: PlayerSnapshot = {
      viewerId: "p1",
      revision: 12,
      phase: "finished",
      players: [],
      hand: [],
      drawCount: 0,
      topDiscard: null,
      currentPlayerId: null,
      direction: 1,
      activeColor: null,
      pendingChoice: null,
      drawStack: null,
      unoWindow: null,
      winner: "p1",
      legalCardIds: [],
      allowedControls: ["leave-room"],
      matchStatus: "round-complete",
      roundNumber: 1,
      targetScore: 1000,
      scores: [{ playerId: "p1", points: 200 }],
      roundResult: {
        roundNumber: 1,
        winnerId: "p1",
        breakdown: [{ playerId: "p1", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 200 }],
        matchWinnerId: null,
      },
      matchWinner: null,
    };

    expect(snapshot.scores).toEqual([{ playerId: "p1", points: 200 }]);
    expect(snapshot.roundResult?.roundNumber).toBe(1);
  });
});
