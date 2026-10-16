# UNO No Mercy

A complete, server-authoritative multiplayer web implementation of **UNO No Mercy**. Features a modular Bun + Hono backend and a modern React + Vite frontend with realtime WebSockets, strict rule enforcement, 2–6 player seat positioning, and reconnect resilience.

## Features & Rules Enforced

- **Canonical 168-Card Deck**: Fully faithful UNO No Mercy card composition — colored Draw 4s, colored Discard Alls, colored Skip Everyones, Wild Reverse Draw 4, Wild Color Roulette, Wild Draw 6, and Wild Draw 10 (no vanilla Wilds).
- **Authoritative Server Engine**: All game state, deck shuffling, draw stacking, player elimination, and turn sequencing run on the backend. Clients receive sanitized, personalized snapshots with hidden opponent hands.
- **Revised Setup & Turn Rules**: Voluntarily drawn cards remain in hand and pass the turn; draw-until-playable continues drawing until a card is playable and plays it immediately. Discard All discards all matching-color cards while keeping the played Discard All visibly on top.
- **Multi-Round Scored Matches**: Matches run authoritatively to a 1,000-point target across rounds. Round winners score face-value numbers, 20 points for colored actions, 50 points for wild actions, and 250 points for opponents eliminated directly by gameplay. Dealers rotate each round, standings remain public, and the host authorizes each next round.
- **Mercy Rule**: Any player holding 25 or more cards is instantly eliminated from the match.
- **Draw Stacking**: Draw 2, Draw 4, Draw 6, and Draw 10 cards stack progressively until an opponent cannot match or raise the penalty.
- **Dynamic 2–6 Player Table**: The local viewer is always positioned at the bottom seat; opponents are seated clockwise around the table with adaptive 2, 3, 4, 5, or 6 player layouts.
- **Session Reconnection**: Players can refresh or briefly disconnect; the server holds the seat for 50 seconds while the client reconnects automatically up to 10 times.
- **Frontend Dev Mode**: Standalone card visualizer and table layout inspector operable without running a backend server.

## Stack

- **Frontend**: Vite, React 19, TypeScript, Motion, Testing Library, Vitest
- **Backend**: Bun, Hono, TypeScript, native WebSockets
- **Tests**: Bun Test (backend, 100+ tests), Vitest (frontend, 90+ tests)

## Project Structure

```text
.
├── frontend/              # React single-page application
│   └── src/
│       ├── api/           # REST & WebSocket transport clients
│       ├── components/    # Live table, lobby, dialogs, cards, seats
│       └── game/          # Frontend protocol types, catalog, session
├── backend/               # Authoritative Bun + Hono backend service
│   └── src/
│       ├── config/        # Environment parsing
│       ├── middleware/    # CORS, error handling
│       ├── modules/
│       │   ├── cards/     # 168-card deck definition & shuffling
│       │   ├── engine/    # Pure state machine & No Mercy rule reducer
│       │   ├── game/      # Room aggregate, projection, and in-memory store
│       │   ├── realtime/  # Authenticated WebSocket gateway & protocol
│       │   └── room/      # REST create/join room endpoints
│       ├── app.ts         # Hono app composition
│       └── server.ts      # Bun HTTP + WebSocket server entry point
├── scripts/dev.ts         # Convenience runner for local full-stack dev
└── package.json           # Root automation scripts
```

## Prerequisites

- [Bun](https://bun.sh/) 1.x or newer

## Local Development

Install dependencies for both frontend and backend:

```bash
bun run setup
```

Start both servers concurrently:

```bash
bun run dev
```

Open:
- **Frontend App**: <http://localhost:5173>
- **Backend Health Check**: <http://localhost:3000/api/health>

You can also run either application independently:

```bash
bun run --cwd frontend dev
bun run --cwd backend dev
```

## Two-Browser Local Multiplayer Testing

To test multiplayer locally on a single machine:

1. Open **Browser Window 1** (e.g. Chrome) at <http://localhost:5173>.
2. Click **Create game room**, enter a name (e.g. "Alice"), and click **Create Room**. You will enter the lobby and receive a 6-character room code (e.g. `ABCDEF`).
3. Open **Browser Window 2** (e.g. Chrome Incognito or Firefox) at <http://localhost:5173>.
4. Click **Join game room**, enter the 6-character code and a name (e.g. "Bob"), and click **Join Room**.
5. In **Browser Window 1**, the lobby will reflect Bob's presence and the **Start Game** button will become enabled (requires 2–6 players).
6. Click **Start Game**. Both windows will simultaneously transition into the live game table.
7. Play through turns, legal card plays, revised draw modes (voluntary draw-and-pass vs draw-until-playable), Discard All mechanics, and stack penalties.
8. Finish a round by emptying a hand or eliminating opponents. Both windows transition into the round result screen showing the round winner, point breakdown (card points and 250pt elimination bonuses), and descending cumulative standings.
9. To test reconnection between rounds: reload Browser Window 2 while viewing round results. Reconnecting preserves standings, and non-host controls stay read-only.
10. In **Browser Window 1** (host), click **Next Round**. Both players transition into Round 2 with rotated dealer position and fresh card deals, while cumulative points persist on seat badges.
11. Continue play until any player reaches or exceeds 1,000 points. Both windows transition into the final **Match Complete** screen displaying the match winner, final standings, and an option to return to the table selector.

## Architecture & Deployment Notes

- **Single Backend Instance**: Game rooms and active matches are maintained in high-performance in-memory state on the backend server. Restarting or redeploying the backend clears active in-memory rooms. In production, run as a single instance or configure sticky sessions if using a reverse proxy.
- **Seat Expiry & Cleanup**: When a player drops connection, the server preserves their seat and hand for 50 seconds. If they do not reconnect within 50 seconds, they forfeit and are eliminated. Empty rooms are automatically reclaimed.
- **Strict Protocol Versioning**: All client commands and server snapshots use Version 1 envelope contracts with monotonic revision numbers for command deduplication.

## Environment Variables

Copy `.env.example` to `.env` in `frontend` or `backend` if customizing local defaults:

| Application | Variable | Local Default | Purpose |
| --- | --- | --- | --- |
| Frontend | `VITE_API_URL` | `http://localhost:3000` | Public backend HTTP & WebSocket base URL |
| Backend | `PORT` | `3000` | HTTP & WebSocket server port |
| Backend | `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origins for CORS |

## Verification & Quality Checks

Run all unit, integration, and type checks across both projects:

```bash
bun run check
```

Run production builds only:

```bash
bun run build
```

## Deploying to Production

### Frontend (Vercel)
1. Import repository into Vercel with **Root Directory** set to `frontend`.
2. Framework preset: **Vite**. Build command: `bun run build`. Output directory: `dist`.
3. Set environment variable: `VITE_API_URL` to your production backend URL (e.g. `https://uno-backend.onrender.com`).

### Backend (Render)
1. Create a **Web Service** on Render with **Root Directory** set to `backend`.
2. Build command: `bun install --frozen-lockfile`.
3. Start command: `bun run start`.
4. Set environment variable: `CORS_ORIGIN` to your deployed frontend domain (e.g. `https://uno-no-mercy.vercel.app`).
