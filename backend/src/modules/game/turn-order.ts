import type { GameState } from "./game.types";

export function getNextEligiblePlayerId(
  state: GameState,
  options: { steps?: number; fromPlayerId?: string } = {},
): string | null {
  const { players, direction } = state;
  let index = players.findIndex(({ id }) => id === (options.fromPlayerId ?? state.currentPlayerId));
  const steps = options.steps ?? 1;
  const eligibleCount = players.filter(({ eliminated }) => !eliminated).length;
  if (index < 0 || eligibleCount === 0 || !Number.isSafeInteger(steps) || steps < 1) return null;

  // Whole circuits do not change the result; bound the search even for large step counts.
  let remaining = ((steps - 1) % eligibleCount) + 1;
  for (let visited = 0; visited < players.length; visited++) {
    index = (index + direction + players.length) % players.length;
    if (!players[index]!.eliminated && --remaining === 0) return players[index]!.id;
  }
  return null;
}
