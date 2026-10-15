import { motion } from "motion/react";

type DevModeHubProps = {
  onBack: () => void;
  onInspectGameboard: () => void;
  onViewCards: () => void;
};

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
              <i /><i /><i /><i /><b>UNO</b>
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
              <i>7</i><i>⊘</i><i>+6</i>
            </span>
            <span className="dev-tool__copy">
              <small>02 / Card library</small>
              <strong>View All Cards</strong>
              <em>Every unique face and its future asset filename</em>
            </span>
            <span className="dev-tool__arrow" aria-hidden="true">↗</span>
          </button>
        </div>
      </motion.section>
    </main>
  );
}
