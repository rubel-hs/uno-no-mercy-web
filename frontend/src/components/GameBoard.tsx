import { motion } from "motion/react";

import { cardBack, findCard } from "../game/cards";
import { GameCard } from "./GameCard";
import { PlayerSeat } from "./PlayerSeat";

const playerHand = [
  findCard("green-5"), findCard("red-skip"), findCard("red-7"),
  findCard("wild-reverse-draw-4"), findCard("green-7"),
  findCard("yellow-skip"), findCard("red-1"),
];

export function GameBoard() {
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
          <div className="direction-indicator" aria-label="Play direction: clockwise"><span>↻</span></div>
          <div className="pile pile--discard">
            <span className="pile__echo" aria-hidden="true" />
            <GameCard card={findCard("blue-0")} size="large" />
          </div>
        </div>
        <div className="table-callouts">
          <span><i className="status-dot status-dot--red" />Stack <b>+6</b></span>
          <span><i className="status-dot status-dot--blue" />Color <b>Blue</b></span>
          <span><i className="status-dot status-dot--white" />Direction <b>↻</b></span>
        </div>
      </div>

      <button className="uno-button" type="button" aria-label="Call UNO">
        <span>UNO!</span><small>Call it</small>
      </button>
    </motion.section>
  );
}
