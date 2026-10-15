import type { CardColor, PublicPlayer } from "../game/protocol";

export interface GameChoiceDialogProps {
  choice: {
    type: "choose-color" | "choose-swap-target" | "choose-roulette-color";
    playerId: string;
  };
  viewerId: string;
  players: PublicPlayer[];
  onChooseColor: (color: CardColor) => void;
  onChooseRouletteColor: (color: CardColor) => void;
  onChooseSwapTarget: (targetPlayerId: string) => void;
}

const COLORS: { color: CardColor; label: string; bg: string }[] = [
  { color: "red", label: "Red", bg: "var(--uno-red)" },
  { color: "yellow", label: "Yellow", bg: "var(--uno-yellow)" },
  { color: "green", label: "Green", bg: "var(--uno-green)" },
  { color: "blue", label: "Blue", bg: "var(--uno-blue)" },
];

export function GameChoiceDialog({
  choice,
  viewerId,
  players,
  onChooseColor,
  onChooseRouletteColor,
  onChooseSwapTarget,
}: GameChoiceDialogProps) {
  // Only display choice dialog to the player who owns the choice
  if (choice.playerId !== viewerId) return null;

  const isColorChoice = choice.type === "choose-color";
  const isRouletteChoice = choice.type === "choose-roulette-color";
  const isSwapChoice = choice.type === "choose-swap-target";

  const eligibleSwapTargets = players.filter(
    (p) => p.id !== viewerId && !p.eliminated,
  );

  return (
    <div className="dialog-backdrop">
      <div
        aria-labelledby="choice-dialog-title"
        aria-modal="true"
        className="dialog-panel choice-dialog-panel"
        role="dialog"
      >
        <div className="dialog-header">
          <span className="section-kicker">Mandatory action</span>
          <h2 id="choice-dialog-title">
            {isColorChoice && "Choose a color"}
            {isRouletteChoice && "Color Roulette — Choose a color"}
            {isSwapChoice && "Swap Hands — Choose a player"}
          </h2>
          <p>
            {isColorChoice && "Select the active color to continue play."}
            {isRouletteChoice &&
              "Pick a color. The next player must draw until they find this color."}
            {isSwapChoice &&
              "Choose an opponent to swap your entire hand with."}
          </p>
        </div>

        {(isColorChoice || isRouletteChoice) && (
          <div className="choice-color-grid">
            {COLORS.map(({ color, label, bg }) => (
              <button
                aria-label={label}
                className={`choice-color-btn choice-color-btn--${color}`}
                key={color}
                onClick={() =>
                  isColorChoice
                    ? onChooseColor(color)
                    : onChooseRouletteColor(color)
                }
                style={{ backgroundColor: bg }}
                type="button"
              >
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}

        {isSwapChoice && (
          <div className="choice-player-list">
            {eligibleSwapTargets.map((target) => (
              <button
                aria-label={target.name}
                className="choice-player-btn"
                key={target.id}
                onClick={() => onChooseSwapTarget(target.id)}
                type="button"
              >
                <div aria-hidden="true" className="choice-player-btn__avatar">
                  {target.name.charAt(0).toUpperCase()}
                </div>
                <div aria-hidden="true" className="choice-player-btn__info">
                  <strong>{target.name}</strong>
                  <small>{target.cardCount} cards</small>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
