import { useState } from "react";

import { CardDevMode } from "./components/CardDevMode";
import { DevModeHub } from "./components/DevModeHub";
import { GameBoard } from "./components/GameBoard";
import { HomeScreen } from "./components/HomeScreen";
import { LiveGameScreen } from "./components/LiveGameScreen";
import { LobbyScreen } from "./components/LobbyScreen";
import { RoomDialog } from "./components/RoomDialog";
import { useGameSession } from "./game/useGameSession";

type View = "home" | "dev" | "gameboard" | "cards";

export default function App() {
  const [view, setView] = useState<View>("home");
  const [dialogMode, setDialogMode] = useState<"create" | "join" | null>(null);

  const session = useGameSession();

  if (view === "cards") {
    return <CardDevMode onClose={() => setView("dev")} />;
  }

  if (view === "gameboard") {
    return (
      <main className="game-shell">
        <header className="game-header game-header--inspector">
          <div className="wordmark" aria-label="UNO No Mercy">
            <span>UNO</span>
            <b>NO MERCY</b>
          </div>
          <div className="game-header__room">
            <span>Dev mode</span>
            <strong>Gameboard inspector</strong>
          </div>
          <button
            aria-label="Return to dev mode"
            className="control-button"
            onClick={() => setView("dev")}
            type="button"
          >
            ← Return to dev mode
          </button>
        </header>
        <GameBoard />
        <footer className="game-footer">
          <span>
            <i className="status-dot status-dot--green" />
            Frontend-only preview
          </span>
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

  // Active multiplayer room
  if (session.credentials) {
    if (session.snapshot && session.snapshot.phase !== "lobby") {
      return (
        <main className="game-shell">
          <header className="game-header">
            <div className="wordmark" aria-label="UNO No Mercy">
              <span>UNO</span>
              <b>NO MERCY</b>
            </div>
            <div className="game-header__room">
              <span>Room</span>
              <strong>{session.credentials.roomCode}</strong>
            </div>
            <button
              aria-label="Leave room"
              className="control-button"
              onClick={session.leave}
              type="button"
            >
              ← Leave room
            </button>
          </header>
          <LiveGameScreen
            connectionState={session.status}
            onCommand={(command) => {
              if (command.type === "start-next-round") {
                session.startNextRound();
              } else {
                session.send(command);
              }
            }}
            onLeaveRoom={session.leave}
            reconnectAttempt={session.reconnectAttempt}
            snapshot={session.snapshot}
          />
        </main>
      );
    }

    const fallbackSnapshot = session.snapshot || {
      roomCode: session.credentials.roomCode,
      hostPlayerId: session.credentials.playerId,
      viewerId: session.credentials.playerId,
      revision: 0,
      phase: "lobby" as const,
      players: [
        {
          id: session.credentials.playerId,
          name: "You",
          order: 0,
          cardCount: 0,
          online: true,
          eliminated: false,
        },
      ],
      hand: [],
      drawCount: 168,
      topDiscard: null,
      currentPlayerId: null,
      direction: 1 as const,
      activeColor: null,
      pendingChoice: null,
      drawStack: null,
      unoWindow: null,
      winner: null,
      legalCardIds: [],
      allowedControls: ["leave-room" as const],
      matchStatus: "lobby" as const,
      roundNumber: 0,
      targetScore: 1000 as const,
      scores: [{ playerId: session.credentials.playerId, points: 0 }],
      roundResult: null,
      matchWinner: null,
    };

    return (
      <LobbyScreen
        connectionState={session.status}
        onLeaveRoom={session.leave}
        onStartGame={session.start}
        reconnectAttempt={session.reconnectAttempt}
        snapshot={fallbackSnapshot}
        viewerId={session.credentials.playerId}
      />
    );
  }

  return (
    <>
      <HomeScreen
        onCreateRoom={() => setDialogMode("create")}
        onJoinRoom={() => setDialogMode("join")}
        onOpenDevMode={() => setView("dev")}
      />
      <RoomDialog
        isOpen={dialogMode !== null}
        mode={dialogMode || "create"}
        onClose={() => setDialogMode(null)}
        onSubmitCreate={session.create}
        onSubmitJoin={session.join}
      />
    </>
  );
}
