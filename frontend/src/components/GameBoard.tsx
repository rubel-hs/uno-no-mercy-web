import { motion } from "motion/react";

import directionIcon from "../assets/icons/game_direction.png";
import { cardBack, findCard, type CardDefinition } from "../game/cards";
import { GameCard } from "./GameCard";
import { PlayerSeat } from "./PlayerSeat";

const playerHand = [
  findCard("green-5"), findCard("red-skip"), findCard("red-7"),
  findCard("wild-reverse-draw-4"), findCard("green-7"),
  findCard("yellow-skip"), findCard("red-1"),
];

type GameBoardProps = {
  direction?: "clockwise" | "counterclockwise";
  stackedCards?: CardDefinition[];
};

export function GameBoard({ direction = "clockwise", stackedCards = [] }: GameBoardProps) {
  return (
    <motion.section
      animate={{ opacity: 1, scale: 1 }}
      aria-label="UNO No Mercy game table"
      className="game-table"
      initial={{ opacity: 0, scale: 0.985 }}
      role="region"
      transition={{ duration: 0.38 }}
    >
      <div className="table-grid" aria-hidden="true" />
      <div className="table-scar table-scar--one" aria-hidden="true" />
      <div className="table-scar table-scar--two" aria-hidden="true" />

      <PlayerSeat count={7} name="Maya" orientation="horizontal" points={0} position="top" />
      <PlayerSeat count={9} name="Dex" orientation="vertical" points={0} position="left" />
      <PlayerSeat count={6} name="Nova" orientation="vertical" points={0} position="right" />
      <PlayerSeat active cards={playerHand} count={playerHand.length} name="You" orientation="horizontal" points={0} position="bottom" />

      <div className="table-center">
        <div className="play-zone">
          <div className="pile pile--draw">
            <span className="pile__count">84</span>
            <GameCard card={cardBack} size="large" />
          </div>
          <div className="pile pile--discard">
            <span className="pile__echo" aria-hidden="true" />
            <GameCard card={findCard("blue-0")} size="large" />
            {stackedCards.length > 0 && (
              <div className="pile__power-stack" aria-label="Stacked power cards" role="group">
                {stackedCards.map((card, index) => (
                  <div
                    className="pile__stacked-card"
                    key={`${card.id}-${index}`}
                    style={{
                      zIndex: index + 1,
                      transform: `translate(${(index + 1) * 5}px, ${-(index + 1) * 5}px) rotate(${index % 2 === 0 ? -2 : 2}deg)`,
                    }}
                  >
                    <GameCard card={card} size="large" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="game-status-rail" aria-label="Table status and actions" role="group">
          <div className="game-status-stack" aria-label="Stack penalty: draw 6">
            <span>Stack</span>
            <strong>+6</strong>
          </div>
          <div className="game-status-color" aria-label="Current color: blue" role="img" />
          <div className="game-status-direction">
            <img
              alt={`Play direction: ${direction}`}
              className={`game-direction-icon game-direction-icon--${direction}`}
              draggable={false}
              src={directionIcon}
            />
          </div>
          <button className="pass-button" type="button" aria-label="Pass turn">Pass</button>
        </div>
      </div>

      <button className="uno-button" type="button" aria-label="Call UNO">
        <span>UNO!</span><small>Call it</small>
      </button>
    </motion.section>
  );
}
