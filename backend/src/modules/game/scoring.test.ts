import { describe, expect, test } from "bun:test";
import { CARD_FACES } from "./deck";
import type { GamePlayer, GameState } from "./game.types";
import { calculateRoundResult, cardPointValue } from "./scoring";

function player(
  id: string,
  faces: string[] = [],
  overrides: Partial<GamePlayer> = {},
): GamePlayer {
  return {
    id,
    hand: faces.map((faceId, index) => ({ instanceId: `${id}-${index}`, faceId })),
    eliminated: false,
    eliminatedByPlayerId: null,
    ...overrides,
  };
}

function completedRound(players: GamePlayer[], winner = "a"): GameState {
  return {
    players,
    drawPile: [{ instanceId: "draw", faceId: "wild-draw-10" }],
    discardPile: [{ instanceId: "top", faceId: "red-9" }],
    direction: 1,
    currentPlayerId: winner,
    activeColor: "red",
    phase: "finished",
    pendingChoice: null,
    drawStack: null,
    unoWindow: null,
    winner,
    revision: 12,
    gameplaySequence: 9,
  };
}

describe("cardPointValue", () => {
  // Catches scoring numbers as actions, including the special 0/7 hand effects.
  for (const color of ["red", "yellow", "green", "blue"]) {
    test.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])(`${color} %i is worth its printed value`, (value) => {
      const face = CARD_FACES.find(({ faceId }) => faceId === `${color}-${value}`)!;
      expect(cardPointValue(face)).toBe(value);
    });

    // Catches treating Draw 2/4 as their draw count or missing a colored action family.
    test.each(["skip", "reverse", "draw-2", "draw-4", "discard-all", "skip-everyone"])(
      `${color} %s is worth 20 points`,
      (kind) => {
        const face = CARD_FACES.find(({ faceId }) => faceId === `${color}-${kind}`)!;
        expect(cardPointValue(face)).toBe(20);
      },
    );
  }

  // Catches valuing wilds at 20 points or at their draw count.
  test.each(["wild-reverse-draw-4", "wild-color-roulette", "wild-draw-6", "wild-draw-10"])(
    "%s is worth 50 points",
    (faceId) => {
      expect(cardPointValue(CARD_FACES.find((face) => face.faceId === faceId)!)).toBe(50);
    },
  );
});

describe("calculateRoundResult", () => {
  // Catches scoring only one opponent, scoring the winner's own hand or piles,
  // and confusing duplicate physical cards with a single face.
  test.each(["a", "b", "c"])("awards all mixed opponent hands only to winner %s", (winner) => {
    const round = completedRound([
      player("a", ["red-3", "yellow-skip", "wild-draw-6"]),
      player("b", ["blue-0", "green-draw-4", "wild-color-roulette"]),
      player("c", ["blue-7", "blue-7"]),
    ], winner);
    const cardPoints = { a: 84, b: 87, c: 143 }[winner];

    expect(calculateRoundResult(round, {}, 3)).toEqual({
      roundNumber: 3,
      winnerId: winner,
      breakdown: ["a", "b", "c"].map((playerId) => ({
        playerId,
        cardPoints: playerId === winner ? cardPoints : 0,
        eliminationBonus: 0,
        roundPoints: playerId === winner ? cardPoints : 0,
        cumulativePoints: playerId === winner ? cardPoints : 0,
      })),
      matchWinnerId: null,
    });
  });

  // Catches including removed hands even if a snapshot retains their cards.
  test("excludes eliminated and cleared hands from the winner's card points", () => {
    const round = completedRound([
      player("a", ["wild-draw-10"]),
      player("b", ["red-4"]),
      player("c", ["wild-draw-6", "red-9"], { eliminated: true }),
      player("d", [], { eliminated: true }),
    ]);

    expect(calculateRoundResult(round, {}, 1).breakdown.map(({ cardPoints }) => cardPoints))
      .toEqual([4, 0, 0, 0]);
  });

  // Catches dropping bonuses for non-winners/eliminated actors, counting self
  // elimination, crediting null causes, or counting non-eliminated opponents.
  test("awards 250 per directly eliminated opponent to the credited player", () => {
    const round = completedRound([
      player("a"),
      player("b", [], { eliminated: true, eliminatedByPlayerId: "b" }),
      player("c", [], { eliminated: true, eliminatedByPlayerId: "b" }),
      player("d", [], { eliminated: true, eliminatedByPlayerId: "b" }),
      player("e", [], { eliminated: true, eliminatedByPlayerId: "a" }),
      player("f", [], { eliminated: true }),
      player("g", ["red-5"], { eliminatedByPlayerId: "a" }),
    ]);

    expect(calculateRoundResult(round, { a: 100, b: 200 }, 2)).toEqual({
      roundNumber: 2,
      winnerId: "a",
      breakdown: [
        { playerId: "a", cardPoints: 5, eliminationBonus: 250, roundPoints: 255, cumulativePoints: 355 },
        { playerId: "b", cardPoints: 0, eliminationBonus: 500, roundPoints: 500, cumulativePoints: 700 },
        { playerId: "c", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 0 },
        { playerId: "d", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 0 },
        { playerId: "e", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 0 },
        { playerId: "f", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 0 },
        { playerId: "g", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 0 },
      ],
      matchWinnerId: null,
    });
  });

  // Catches resetting a departed player's historical total between rounds.
  test("retains prior scores for players absent from the completed round", () => {
    const round = completedRound([player("a"), player("b", ["blue-2"])]);
    expect(calculateRoundResult(round, { a: 40, b: 60, departed: 900 }, 4).breakdown).toEqual([
      { playerId: "a", cardPoints: 2, eliminationBonus: 0, roundPoints: 2, cumulativePoints: 42 },
      { playerId: "b", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 60 },
      { playerId: "departed", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 900 },
    ]);
  });

  // Catches using > instead of >=, a wrong target, or only the current round total.
  test.each([
    [990, null],
    [991, "a"],
    [992, "a"],
  ] as const)("resolves the 1,000-point boundary from prior score %i", (prior, expectedWinner) => {
    const round = completedRound([player("a"), player("b", ["red-9"])]);
    const result = calculateRoundResult(round, { a: prior }, 5);
    expect(result.breakdown[0]!.cumulativePoints).toBe(prior + 9);
    expect(result.matchWinnerId).toBe(expectedWinner);
  });

  // Catches selecting the round winner when another player's bonus crosses first.
  test("can award the match to a non-round-winner through an elimination bonus", () => {
    const round = completedRound([
      player("a"),
      player("b", ["red-1"]),
      player("c", [], { eliminated: true, eliminatedByPlayerId: "b" }),
    ]);
    expect(calculateRoundResult(round, { b: 750 }, 2).matchWinnerId).toBe("b");
  });

  // Catches choosing the first player crossing the target or preferring the
  // round winner over a strictly higher cumulative score.
  test.each([
    [{ a: 990, b: 800 }, "b"],
    [{ a: 1100, b: 800 }, "a"],
  ] as const)("chooses the highest cumulative score when multiple players cross (%j)", (prior, expected) => {
    const round = completedRound([
      player("a"),
      player("b", ["red-skip"]),
      player("c", [], { eliminated: true, eliminatedByPlayerId: "b" }),
    ]);
    expect(calculateRoundResult(round, prior, 2).matchWinnerId).toBe(expected);
  });

  // Catches order-dependent tie resolution or awarding a below-target match.
  test.each(["a", "b"])("breaks exact cumulative ties in favor of round winner %s", (winner) => {
    const other = winner === "a" ? "b" : "a";
    const round = completedRound([
      player("a", winner === "a" ? [] : ["red-skip"]),
      player("b", winner === "b" ? [] : ["red-skip"]),
      player("c", [], { eliminated: true, eliminatedByPlayerId: other }),
    ], winner);
    expect(calculateRoundResult(round, { [winner]: 980, [other]: 750 }, 2).matchWinnerId).toBe(winner);
    expect(calculateRoundResult(round, { [winner]: 979, [other]: 749 }, 2).matchWinnerId).toBeNull();
  });

  // Catches falling back to seat order when the tied leaders are both opponents.
  test("uses the round winner to resolve an exact tie between the highest-scoring opponents", () => {
    const round = completedRound([
      player("a", ["red-1"]),
      player("b", ["blue-1"]),
      player("c"),
      player("d", [], { eliminated: true, eliminatedByPlayerId: "a" }),
      player("e", [], { eliminated: true, eliminatedByPlayerId: "b" }),
    ], "c");

    expect(calculateRoundResult(round, { a: 750, b: 750 }, 2).matchWinnerId).toBe("c");
  });

  // Catches in-place score addition, hand/seat sorting, cause clearing, or reuse
  // of cached result objects that later callers can alter.
  test("is repeatable without mutating the round or prior score map", () => {
    const round = completedRound([
      player("b", ["wild-draw-10", "red-3"]),
      player("a"),
      player("c", [], { eliminated: true, eliminatedByPlayerId: "b" }),
    ]);
    const prior = Object.freeze({ a: 100, b: 200 });
    const before = structuredClone(round);

    const first = calculateRoundResult(round, prior, 2);
    const second = calculateRoundResult(round, prior, 2);
    expect(first).toEqual(second);
    expect(round).toEqual(before);
    expect(prior).toEqual({ a: 100, b: 200 });
    expect(first.breakdown).toEqual([
      { playerId: "b", cardPoints: 0, eliminationBonus: 250, roundPoints: 250, cumulativePoints: 450 },
      { playerId: "a", cardPoints: 53, eliminationBonus: 0, roundPoints: 53, cumulativePoints: 153 },
      { playerId: "c", cardPoints: 0, eliminationBonus: 0, roundPoints: 0, cumulativePoints: 0 },
    ]);

    first.breakdown[0]!.cumulativePoints = -1;
    expect(calculateRoundResult(round, prior, 2)).toEqual(second);
  });
});
