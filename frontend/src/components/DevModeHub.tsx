import { motion } from "motion/react";

import directionIcon from "../assets/icons/game_direction.png";
import { cardBack, findCard } from "../game/cards";
import { GameCard } from "./GameCard";

type DevModeHubProps = {
  onBack: () => void;
  onInspectGameboard: () => void;
  onViewCards: () => void;
};

const previewCards = [
  findCard("red-7"),
  findCard("blue-skip"),
  findCard("wild-draw-6"),
];
const miniHand = [
  findCard("green-5"),
  findCard("red-skip"),
  findCard("red-7"),
  findCard("wild-reverse-draw-4"),
  findCard("yellow-skip"),
];
const miniDiscard = findCard("blue-0");

export function DevModeHub({ onBack, onInspectGameboard, onViewCards }: DevModeHubProps) {
  return (
    <main className="dev-hub">
      <header className="dev-hub__nav">
        <div className="wordmark" aria-label="UNO No Mercy">
          <span>UNO</span>
          <b>NO MERCY</b>
        </div>
        <button className="control-button" onClick={onBack} type="button">← Home</button>
      </header>

      <motion.section animate={{ opacity: 1, y: 0 }} className="dev-hub__content" initial={{ opacity: 0, y: 16 }}>
        <div className="dev-hub__intro">
          <span className="section-kicker">Visual lab / 00</span>
          <h1>Dev mode</h1>
          <p>Inspect the complete interface without creating a room or connecting to the game backend.</p>
          <span className="offline-pill"><i className="status-dot status-dot--green" />No game server required</span>
        </div>

        <div className="dev-hub__actions">
          <button aria-label="Inspect gameboard" className="dev-tool" onClick={onInspectGameboard} type="button">
            <span className="dev-tool__preview dev-tool__preview--board" aria-hidden="true">
              <div className="mini-board">
                <div className="mini-board__grid" />
                <div className="mini-board__scar mini-board__scar--one" />
                <div className="mini-board__scar mini-board__scar--two" />

                {/* Top seat: Maya */}
                <div className="mini-seat mini-seat--top">
                  <div className="mini-seat__meta">
                    <span>MAYA</span>
                    <small>7</small>
                  </div>
                  <div className="mini-seat__hand">
                    <GameCard alignFlat card={cardBack} />
                    <GameCard alignFlat card={cardBack} />
                    <GameCard alignFlat card={cardBack} />
                  </div>
                </div>

                {/* Left seat: Dex */}
                <div className="mini-seat mini-seat--left">
                  <div className="mini-seat__meta">
                    <span>DEX</span>
                    <small>9</small>
                  </div>
                  <div className="mini-seat__hand">
                    <GameCard alignFlat card={cardBack} rotation={90} />
                    <GameCard alignFlat card={cardBack} rotation={90} />
                  </div>
                </div>

                {/* Right seat: Nova */}
                <div className="mini-seat mini-seat--right">
                  <div className="mini-seat__meta">
                    <span>NOVA</span>
                    <small>6</small>
                  </div>
                  <div className="mini-seat__hand">
                    <GameCard alignFlat card={cardBack} rotation={-90} />
                    <GameCard alignFlat card={cardBack} rotation={-90} />
                  </div>
                </div>

                {/* Table center */}
                <div className="mini-center">
                  <div className="mini-playzone">
                    <div className="mini-pile mini-pile--draw">
                      <span className="mini-pile__count">84</span>
                      <GameCard alignFlat card={cardBack} />
                    </div>
                    <div className="mini-direction"><img alt="" draggable={false} src={directionIcon} /></div>
                    <div className="mini-pile mini-pile--discard">
                      <span className="mini-pile__echo" />
                      <GameCard alignFlat card={miniDiscard} />
                    </div>
                  </div>
                  <div className="mini-callouts">
                    <span className="mini-callout--red">+6</span>
                    <span className="mini-callout--blue">Blue</span>
                    <span className="mini-callout--white"><img alt="" draggable={false} src={directionIcon} /></span>
                  </div>
                </div>

                {/* Bottom seat: You */}
                <div className="mini-seat mini-seat--bottom">
                  <div className="mini-seat__hand mini-seat__hand--player">
                    {miniHand.map((card) => (
                      <GameCard alignFlat card={card} key={card.id} />
                    ))}
                  </div>
                  <div className="mini-seat__meta mini-seat__meta--active">
                    <i className="status-dot status-dot--red" />
                    <span>YOU</span>
                    <small>0 pts</small>
                  </div>
                </div>

                {/* Mini UNO button */}
                <div className="mini-uno-button">
                  <span>UNO!</span>
                </div>
              </div>
            </span>
            <span className="dev-tool__copy">
              <small>01 / Table layout</small>
              <strong>Inspect Gameboard</strong>
              <em>Players, hands, piles, status and responsive layout</em>
            </span>
            <span className="dev-tool__arrow" aria-hidden="true">↗</span>
          </button>

          <button aria-label="View all cards" className="dev-tool" onClick={onViewCards} type="button">
            <span className="dev-tool__preview dev-tool__preview--cards" aria-hidden="true">
              {previewCards.map((card) => (
                <GameCard alignFlat card={card} key={card.id} />
              ))}
            </span>
            <span className="dev-tool__copy">
              <small>02 / Card library</small>
              <strong>View All Cards</strong>
              <em>Every unique face and its asset filename</em>
            </span>
            <span className="dev-tool__arrow" aria-hidden="true">↗</span>
          </button>
        </div>
      </motion.section>
    </main>
  );
}
