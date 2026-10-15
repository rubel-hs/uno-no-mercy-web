# UNO No Mercy

A complete, server-authoritative multiplayer web implementation of **UNO No Mercy**. Features a modular Bun + Hono backend and a modern React + Vite frontend with realtime WebSockets, strict rule enforcement, 2–6 player seat positioning, and reconnect resilience.

## Features & Rules Enforced

- **Canonical 168-Card Deck**: Fully faithful UNO No Mercy card composition — colored Draw 4s, colored Discard Alls, colored Skip Everyones, Wild Reverse Draw 4, Wild Color Roulette, Wild Draw 6, and Wild Draw 10 (no vanilla Wilds).
- **Authoritative Server Engine**: All game state, deck shuffling, draw stacking, player elimination, and turn sequencing run on the backend. Clients receive sanitized, personalized snapshots with hidden opponent hands.
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
7. Test turns, legal card plays, drawing from the draw pile, stack penalties, and UNO declarations.
8. To test reconnection: close Browser Window 2 or reload the page. Browser Window 1 will display an "Offline" tag for Bob. Reopening the tab or reloading restores the active hand and session immediately.

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
