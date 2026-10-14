# UNO No Mercy

A deployment-ready project foundation for an UNO No Mercy web game. The repository intentionally contains no game rules yet; it verifies that the React frontend and modular Hono API can run together locally and deploy independently.

## Stack

- Frontend: Vite, React, TypeScript, Tailwind CSS, Motion
- Backend: Bun, Hono, TypeScript
- Tests: Bun Test, Vitest, Testing Library

## Project structure

```text
.
├── frontend/              # Self-contained Vercel application
├── backend/               # Self-contained Render web service
│   └── src/
│       ├── config/        # Environment parsing
│       ├── middleware/    # Shared Hono middleware
│       ├── modules/       # Feature-oriented backend modules
│       ├── app.ts         # Application composition
│       └── server.ts      # Bun process entry point
├── scripts/dev.ts         # Runs both local development servers
└── package.json           # Root convenience commands
```

Future backend features such as `game`, `lobby`, `player`, and `cards` should be added as sibling directories under `backend/src/modules`.

## Prerequisites

- [Bun](https://bun.sh/) 1.x or newer

## Local development

Install each application's independent dependencies:

```bash
bun run setup
```

Start the frontend and backend together:

```bash
bun run dev
```

Then open:

- Frontend: <http://localhost:5173>
- Backend health endpoint: <http://localhost:3000/api/health>

You can also run either application independently:

```bash
bun run --cwd frontend dev
bun run --cwd backend dev
```

## Environment variables

Copy the relevant `.env.example` file to `.env` inside each application when you need local overrides.

| Application | Variable | Local default | Purpose |
| --- | --- | --- | --- |
| Frontend | `VITE_API_URL` | `http://localhost:3000` | Public backend base URL |
| Backend | `PORT` | `3000` | HTTP listening port |
| Backend | `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed browser origins |

## Verification

Run every test, type check, and frontend production build:

```bash
bun run check
```

Run production-oriented compilation only:

```bash
bun run build
```

## Deploy the frontend to Vercel

1. Import this Git repository as a Vercel project.
2. Set **Root Directory** to `frontend`.
3. Keep the detected Vite build command (`bun run build`) and output directory (`dist`).
4. Add `VITE_API_URL` with the public Render service URL, without a trailing slash.
5. Deploy the project.

## Deploy the backend to Render

1. Create a Render Web Service from the same Git repository.
2. Set **Root Directory** to `backend`.
3. Set the build command to `bun install --frozen-lockfile`.
4. Set the start command to `bun run start`.
5. Add `CORS_ORIGIN` with the deployed Vercel origin. Use commas if more than one origin is required.
6. Deploy the service. Render supplies `PORT` automatically.

The two platforms watch the same repository but build only their configured application directory.
