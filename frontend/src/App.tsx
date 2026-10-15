import { useState } from "react";

import { CardDevMode } from "./components/CardDevMode";
import { DevModeHub } from "./components/DevModeHub";
import { GameBoard } from "./components/GameBoard";
import { HomeScreen } from "./components/HomeScreen";

type View = "home" | "dev" | "gameboard" | "cards";

export default function App() {
  const [view, setView] = useState<View>("home");

  if (view === "cards") {
    return <CardDevMode onClose={() => setView("dev")} />;
  }

  if (view === "gameboard") {
    return (
      <main className="game-shell">
        <header className="game-header game-header--inspector">
          <div className="wordmark" aria-label="UNO No Mercy"><span>UNO</span><b>NO MERCY</b></div>
          <div className="game-header__room"><span>Dev mode</span><strong>Gameboard inspector</strong></div>
          <button aria-label="Return to dev mode" className="control-button" onClick={() => setView("dev")} type="button">← Return to dev mode</button>
        </header>
        <GameBoard />
        <footer className="game-footer">
          <span><i className="status-dot status-dot--green" />Frontend-only preview</span>
          <span>Round 01</span>
          <span>25 card mercy limit</span>
        </footer>
      </main>
    );
  }

  if (view === "dev") {
    return (
      <DevModeHub
        onBack={() => setView("home")}
        onInspectGameboard={() => setView("gameboard")}
        onViewCards={() => setView("cards")}
      />
    );
  }

  return <HomeScreen onOpenDevMode={() => setView("dev")} />;
}
