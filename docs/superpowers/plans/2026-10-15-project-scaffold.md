# UNO No Mercy Project Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal monorepo whose React frontend and modular Hono backend install independently, run together locally, and are ready to configure as separate Vercel and Render deployments.

**Architecture:** `frontend` and `backend` are self-contained Bun packages with separate lockfiles. The frontend calls one modular `/api/health` endpoint, while dependency-free root scripts coordinate local setup, checks, builds, and both development processes.

**Tech Stack:** Bun, Hono, Vite, React, TypeScript, Tailwind CSS, Motion for React, Vitest, Testing Library

**Spec:** `docs/superpowers/specs/2026-10-15-project-scaffold-design.md`

## Global Constraints

- Do not implement UNO rules, multiplayer behavior, persistence, authentication, WebSockets, or a finished game interface.
- Serve the frontend locally at `http://localhost:5173`.
- Serve the backend locally at `http://localhost:3000` unless `PORT` supplies a valid port.
- Read the browser API origin from `VITE_API_URL`, defaulting to `http://localhost:3000`.
- Read allowed backend origins from `CORS_ORIGIN`, defaulting to `http://localhost:5173`.
- Keep `frontend` and `backend` independently installable and deployable, each with its own lockfile.
- Organize backend features under `backend/src/modules`; keep composition in `app.ts` and process startup in `server.ts`.
- Use root tooling only as optional local-development convenience.

## Review Focus

- A missing, nonnumeric, or out-of-range `PORT` must resolve to port `3000`; Task 1 pins this with configuration tests.
- Comma-separated CORS origins must be trimmed and empty entries removed; Task 1 pins this with configuration tests.
- `/api/health` must return the documented status payload and CORS headers only for allowed origins; Task 1 pins this with application tests.
- `VITE_API_URL` with or without a trailing slash must produce exactly one slash before `api/health`; Task 2 pins this with API-client tests.
- Network failures and non-2xx health responses must render “Backend unavailable” without an unhandled rejection; Task 2 pins this with client and component tests.

---

## Planned File Structure

```text
uno-no-mercy/
├── .gitignore                         # Ignore dependencies, builds, logs, and local env files
├── README.md                          # Local workflow and deployment configuration
├── package.json                       # Dependency-free root convenience commands
├── scripts/dev.ts                     # Start and terminate both development servers
├── backend/
│   ├── .env.example                   # Backend configuration contract
│   ├── bun.lock                       # Backend-only resolved dependencies
│   ├── package.json                   # Backend scripts and dependencies
│   ├── tsconfig.json                  # Strict Bun TypeScript settings
│   └── src/
│       ├── app.ts                     # Compose middleware, routes, and JSON errors
│       ├── app.test.ts                # Health and CORS integration tests
│       ├── server.ts                  # Read config and start Bun server
│       ├── config/
│       │   ├── env.ts                 # Parse port and allowed origins
│       │   └── env.test.ts            # Configuration edge-case tests
│       ├── middleware/
│       │   └── cors.ts                # Create the Hono CORS middleware
│       └── modules/health/
│           ├── health.route.ts        # Health feature router
│           └── health.schema.ts       # Typed health response contract
└── frontend/
    ├── .env.example                   # Browser API URL contract
    ├── bun.lock                       # Frontend-only resolved dependencies
    ├── index.html                     # Vite HTML entry
    ├── package.json                   # Frontend scripts and dependencies
    ├── tsconfig.json                  # Project TypeScript references
    ├── tsconfig.app.json              # Strict browser TypeScript settings
    ├── tsconfig.node.json             # Vite configuration TypeScript settings
    ├── vite.config.ts                 # React, Tailwind, and Vitest configuration
    └── src/
        ├── App.tsx                    # Minimal branded status screen
        ├── main.tsx                   # React browser entry
        ├── index.css                  # Tailwind import and global theme
        ├── vite-env.d.ts              # Vite environment declarations
        ├── test/setup.ts              # DOM matcher setup
        ├── api/
        │   ├── health.ts              # Health response type and fetch client
        │   └── health.test.ts          # URL and response behavior tests
        └── components/
            ├── ApiStatus.tsx           # Health request state component
            └── ApiStatus.test.tsx      # Connected and unavailable UI tests
```

### Task 1: Modular Hono Backend

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/.env.example`
- Create: `backend/src/config/env.ts`
- Create: `backend/src/config/env.test.ts`
- Create: `backend/src/middleware/cors.ts`
- Create: `backend/src/modules/health/health.schema.ts`
- Create: `backend/src/modules/health/health.route.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/app.test.ts`
- Create: `backend/src/server.ts`
- Generate: `backend/bun.lock`

**Interfaces:**
- Consumes: No application interfaces; only Bun and Hono.
- Produces: `AppConfig { port: number; corsOrigins: string[] }`, `loadConfig(env?: Record<string, string | undefined>): AppConfig`, `createApp(config?: AppConfig): Hono`, and `HealthResponse { status: "ok"; service: "uno-no-mercy-api" }`.

- [ ] **Step 1: Create the backend package configuration and install its dependencies**

Define `dev`, `start`, `test`, `typecheck`, and `check` scripts. Add `hono` as a runtime dependency and TypeScript plus Bun types as development dependencies. Run `bun install` from `backend` to generate its local lockfile.

- [ ] **Step 2: Write failing configuration tests**

In `env.test.ts`, assert that `loadConfig({})` returns port `3000` and origin `http://localhost:5173`; valid `PORT: "8080"` is parsed; invalid values such as `"abc"`, `"0"`, and `"70000"` fall back to `3000`; and `CORS_ORIGIN: " https://one.example, ,https://two.example "` becomes the two trimmed origins.

- [ ] **Step 3: Run the configuration tests and verify the expected failure**

Run: `bun test src/config/env.test.ts` from `backend`.

Expected: FAIL because `loadConfig` does not exist.

- [ ] **Step 4: Implement configuration parsing**

Create the exact `AppConfig` interface and `loadConfig` signature from this task’s Interfaces block. Accept only integer ports from `1` through `65535`, and remove blank CORS entries before applying the localhost fallback.

- [ ] **Step 5: Run the configuration tests**

Run: `bun test src/config/env.test.ts` from `backend`.

Expected: all configuration tests PASS.

- [ ] **Step 6: Write failing application tests**

In `app.test.ts`, create the app with an explicit `AppConfig`. Assert that `GET /api/health` returns status `200` and exactly `{ status: "ok", service: "uno-no-mercy-api" }`; an allowed `Origin` receives the matching `access-control-allow-origin`; a disallowed origin does not; and an unknown route returns a JSON `404` response.

- [ ] **Step 7: Run the application tests and verify the expected failure**

Run: `bun test src/app.test.ts` from `backend`.

Expected: FAIL because `createApp` and the health module do not exist.

- [ ] **Step 8: Implement the health module, CORS middleware, and app composition**

Export the exact `HealthResponse` type and a constant response from `health.schema.ts`. Export a Hono router from `health.route.ts`, a middleware factory accepting `readonly string[]` from `cors.ts`, and the exact `createApp` signature from `app.ts`. Mount the health router at `/api/health`; return JSON for `404` and unhandled errors without stack traces.

- [ ] **Step 9: Implement the Bun server entry point**

In `server.ts`, call `loadConfig()`, build the app with `createApp(config)`, and call `Bun.serve` with `config.port` and `app.fetch`. Log the resolved local URL once after startup.

- [ ] **Step 10: Verify and commit the backend**

Run: `bun run check` from `backend`.

Expected: all tests PASS and TypeScript exits with code `0`.

Commit:

```bash
git add backend
git commit -m "feat: scaffold modular Hono backend"
```

### Task 2: Vite React Status Frontend

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.app.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/.env.example`
- Create: `frontend/src/vite-env.d.ts`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/src/api/health.ts`
- Create: `frontend/src/api/health.test.ts`
- Create: `frontend/src/components/ApiStatus.tsx`
- Create: `frontend/src/components/ApiStatus.test.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/index.css`
- Generate: `frontend/bun.lock`

**Interfaces:**
- Consumes: Backend `HealthResponse` wire shape `{ status: "ok"; service: "uno-no-mercy-api" }` over `GET /api/health`.
- Produces: `getHealth(apiBaseUrl?: string): Promise<HealthResponse>` and a zero-prop `ApiStatus` React component.

- [ ] **Step 1: Create the frontend package and tool configuration, then install dependencies**

Define `dev`, `test`, `typecheck`, `build`, and `check` scripts. Add React, React DOM, and Motion as runtime dependencies; add Vite, its React plugin, Tailwind CSS, its Vite plugin, TypeScript, Vitest, jsdom, and Testing Library packages as development dependencies. Configure Vite with React and Tailwind plugins and Vitest with jsdom plus `src/test/setup.ts`. Run `bun install` from `frontend` to generate its local lockfile.

- [ ] **Step 2: Write failing API-client tests**

In `health.test.ts`, stub `fetch` and assert that `getHealth("http://localhost:3000")` and `getHealth("http://localhost:3000/")` both request `http://localhost:3000/api/health`; a successful response returns the typed payload; and a non-2xx response rejects with `Backend health check failed`.

- [ ] **Step 3: Run the API-client tests and verify the expected failure**

Run: `bun run test -- src/api/health.test.ts` from `frontend`.

Expected: FAIL because `getHealth` does not exist.

- [ ] **Step 4: Implement the health API client**

Define the `HealthResponse` wire type and the exact `getHealth` signature from this task’s Interfaces block in `health.ts`. Strip trailing slashes from the supplied or environment-derived base URL before requesting `/api/health`, and reject non-2xx responses with the exact tested error message.

- [ ] **Step 5: Run the API-client tests**

Run: `bun run test -- src/api/health.test.ts` from `frontend`.

Expected: all API-client tests PASS.

- [ ] **Step 6: Write failing status-component tests**

In `ApiStatus.test.tsx`, mock `getHealth`. Assert that the component initially renders `Checking backend…`, then renders `Backend connected` after a successful response, and renders `Backend unavailable` after a rejected request without producing an unhandled rejection.

- [ ] **Step 7: Run the component tests and verify the expected failure**

Run: `bun run test -- src/components/ApiStatus.test.tsx` from `frontend`.

Expected: FAIL because `ApiStatus` does not exist.

- [ ] **Step 8: Implement the status component and minimal application shell**

Implement the zero-prop `ApiStatus` component with explicit checking, connected, and unavailable states. Compose it in `App.tsx` with a small Motion entrance animation. Add the React entry point and Tailwind-based global styling; keep all copy focused on scaffold readiness rather than game functionality.

- [ ] **Step 9: Verify and commit the frontend**

Run: `bun run check` from `frontend`.

Expected: Vitest passes and the Vite production build exits with code `0`.

Commit:

```bash
git add frontend
git commit -m "feat: scaffold React status frontend"
```

### Task 3: Root Workflow, Documentation, and Local Smoke Test

**Files:**
- Create: `.gitignore`
- Create: `package.json`
- Create: `scripts/dev.ts`
- Create: `README.md`
- Modify: `frontend/.env.example`
- Modify: `backend/.env.example`

**Interfaces:**
- Consumes: Each application’s `dev`, `check`, and `build` package scripts.
- Produces: Root `setup`, `dev`, `check`, and `build` commands; a dev orchestrator that terminates both child processes when interrupted.

- [ ] **Step 1: Add root commands and the development-process orchestrator**

Keep the root package private and dependency-free. Make `setup`, `check`, and `build` delegate to each directory via `bun --cwd <directory> ...`. In `scripts/dev.ts`, spawn both `bun --cwd frontend run dev` and `bun --cwd backend run dev` with inherited output, terminate the sibling when either process exits, and forward Ctrl+C termination.

- [ ] **Step 2: Add repository ignores and environment examples**

Ignore all nested `node_modules`, build output, coverage, logs, and `.env` files while retaining `.env.example`. Document `VITE_API_URL=http://localhost:3000`, `PORT=3000`, and `CORS_ORIGIN=http://localhost:5173` in the respective example files.

- [ ] **Step 3: Write the project README**

Document prerequisites, `bun run setup`, `bun run dev`, direct per-app commands, ports, health URL, environment variables, verification commands, and the modular backend layout. Add Vercel instructions using Root Directory `frontend` and `VITE_API_URL`; add Render instructions using Root Directory `backend`, build command `bun install --frozen-lockfile`, start command `bun run start`, and `CORS_ORIGIN`.

- [ ] **Step 4: Run the complete static verification**

Run: `bun run check` from the repository root.

Expected: backend tests and type checking pass; frontend tests and production build pass.

- [ ] **Step 5: Start both local development servers**

Run: `bun run dev` from the repository root and keep the process active for the smoke checks.

Expected: Vite reports `http://localhost:5173`; the backend reports `http://localhost:3000`.

- [ ] **Step 6: Smoke-test the backend and frontend**

Request `http://localhost:3000/api/health` and assert the JSON equals `{ "status": "ok", "service": "uno-no-mercy-api" }`. Request `http://localhost:5173` and assert it returns HTTP `200` with the Vite HTML entry. Stop the root development command and confirm both ports are released.

- [ ] **Step 7: Commit the completed scaffold**

```bash
git add .gitignore package.json scripts README.md frontend/.env.example backend/.env.example
git commit -m "chore: add monorepo development workflow"
```
