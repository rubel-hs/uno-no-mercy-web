import type { CSSProperties } from "react";

import type { CardDefinition } from "../game/cards";

type GameCardProps = {
  alignFlat?: boolean;
  card: CardDefinition;
  className?: string;
  pointerOnly?: boolean;
  rotation?: -90 | 90;
  size?: "small" | "medium" | "large";
  onClick?: () => void;
  disabled?: boolean;
  "data-card-instance-id"?: string;
  style?: CSSProperties;
};

const cardArtwork = import.meta.glob(
  "../assets/cards/*.{png,jpg,jpeg,webp,svg}",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;

const symbolParts: Partial<Record<CardDefinition["kind"], string[]>> = {
  "wild-color-roulette": ["R", "Y", "G", "B"],
  "wild-reverse-draw-4": ["R", "Y", "G", "B"],
};

export function GameCard({
  alignFlat = false,
  card,
  className = "",
  pointerOnly = false,
  rotation,
  size = "medium",
  onClick,
  disabled = false,
  "data-card-instance-id": dataCardInstanceId,
  style: customStyle,
}: GameCardProps) {
  const artworkUrl = cardArtwork[`../assets/cards/${card.assetFile}`];
  const style: CSSProperties & { "--card-tone": string } = {
    "--card-tone": `var(--uno-${card.color})`,
    ...(rotation ? { transform: `rotate(${rotation}deg)` } : alignFlat ? { transform: "none" } : {}),
    ...(pointerOnly ? { cursor: "pointer", transition: "none" } : {}),
    ...customStyle,
  };
  const parts = symbolParts[card.kind];

  return (
    <article
      aria-label={`${card.label} card`}
      className={`game-card game-card--${size} game-card--${card.color} game-card--${card.kind} ${
        disabled ? "is-disabled" : ""
      } ${className}`}
      data-card-instance-id={dataCardInstanceId}
      onClick={disabled ? undefined : onClick}
      style={style}
    >
      {artworkUrl ? (
        <img
          alt={`${card.label} card`}
          className="game-card__artwork"
          draggable={false}
          src={artworkUrl}
        />
      ) : (
        <div className="game-card__face">
          <span className="game-card__corner game-card__corner--top">
            {card.kind === "back" ? "" : card.value.replace("\n", " ")}
          </span>
          <div className="game-card__orbit" aria-hidden="true" />
          <div className="game-card__mark" aria-hidden="true">
            {parts ? (
              <span className="game-card__color-wheel">
                {parts.map((part, index) => <i key={`${part}-${index}`}>{part}</i>)}
              </span>
            ) : card.kind === "back" ? (
              <span className="game-card__brand"><b>UNO</b><em>NO MERCY</em></span>
            ) : (
              card.value.split("\n").map((line) => <span key={line}>{line}</span>)
            )}
          </div>
          <span className="game-card__corner game-card__corner--bottom">
            {card.kind === "back" ? "" : card.value.replace("\n", " ")}
          </span>
        </div>
      )}
    </article>
  );
}
