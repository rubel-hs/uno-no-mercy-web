import { motion } from "motion/react";

type HomeScreenProps = {
  onOpenDevMode: () => void;
  onCreateRoom?: () => void;
  onJoinRoom?: () => void;
};

export function HomeScreen({
  onOpenDevMode,
  onCreateRoom,
  onJoinRoom,
}: HomeScreenProps) {
  return (
    <main className="home-screen">
      <div className="home-screen__grid" aria-hidden="true" />
      <header className="home-nav">
        <div className="wordmark" aria-label="UNO No Mercy">
          <span>UNO</span>
          <b>NO MERCY</b>
        </div>
        <span className="home-nav__status">
          <i className="status-dot status-dot--green" />Visual prototype
        </span>
      </header>

      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="home-hero"
        initial={{ opacity: 0, y: 18 }}
      >
        <div className="home-hero__copy">
          <span className="section-kicker">UNO Show 'Em No Mercy</span>
          <h1>Choose your table</h1>
          <p>
            Create a private room, join your crew, or step into the visual lab
            to inspect every part of the game.
          </p>
        </div>

        <div className="home-actions">
          <button
            aria-label="Create game room"
            className="home-action home-action--create"
            onClick={onCreateRoom}
            type="button"
          >
            <span className="home-action__number">01</span>
            <span className="home-action__icon" aria-hidden="true">＋</span>
            <span className="home-action__content">
              <small>Host a new table</small>
              <strong>Create game room</strong>
              <em>Set up private room</em>
            </span>
            <span className="home-action__arrow" aria-hidden="true">↗</span>
          </button>

          <button
            aria-label="Join game room"
            className="home-action home-action--join"
            onClick={onJoinRoom}
            type="button"
          >
            <span className="home-action__number">02</span>
            <span className="home-action__icon" aria-hidden="true">→</span>
            <span className="home-action__content">
              <small>Enter a room code</small>
              <strong>Join game room</strong>
              <em>Join existing room</em>
            </span>
            <span className="home-action__arrow" aria-hidden="true">↗</span>
          </button>

          <button
            aria-label="Open dev mode"
            className="home-action home-action--dev"
            onClick={onOpenDevMode}
            type="button"
          >
            <span className="home-action__number">03</span>
            <span className="home-action__icon" aria-hidden="true">◇</span>
            <span className="home-action__content">
              <small>Frontend-only tools</small>
              <strong>Dev Mode</strong>
              <em>Inspect board and cards</em>
            </span>
            <span className="home-action__arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </motion.section>

      <footer className="home-meta">
        <span>168 card deck</span>
        <span>2–6 players</span>
        <span>25 card mercy rule</span>
      </footer>
    </main>
  );
}
