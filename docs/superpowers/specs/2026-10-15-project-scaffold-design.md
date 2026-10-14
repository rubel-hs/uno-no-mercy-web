# UNO No Mercy Project Scaffold Design

## Objective

Create a minimal, runnable foundation for an UNO No Mercy web game without implementing game rules. The repository will contain separately deployable frontend and backend applications that can also be started together for local development.

Success means a developer can install dependencies, start both applications, open the frontend at `http://localhost:5173`, and see it successfully report the health of the backend at `http://localhost:3000`.

## Repository Architecture

The project will use one Git repository with self-contained application directories:

```text
uno-no-mercy/
├── frontend/
├── backend/
├── scripts/dev.ts
├── package.json
├── .gitignore
└── README.md
```

Each application will have its own `package.json`, TypeScript configuration, environment example, and lockfile. This keeps Vercel and Render builds independent of files outside their configured root directories. The root package will contain dependency-free convenience scripts for installing, developing, checking, and building both applications.

## Frontend

The frontend will use Vite, React, and TypeScript. Tailwind CSS will provide styling, and Motion for React will provide a small entrance animation that verifies the animation dependency is configured correctly.

The initial interface will be a status screen rather than a game screen. It will identify the project and display whether the backend health endpoint is reachable. API access will be isolated in a small client module so later game features do not place networking logic directly inside components.

Configuration:

- Local URL: `http://localhost:5173`
- API base URL: `VITE_API_URL`, defaulting to `http://localhost:3000`
- Production API URL: configured as a Vercel environment variable

## Backend

The backend will run on Bun and use Hono. It will follow a feature-oriented modular pattern:

```text
backend/src/
├── config/
│   └── env.ts
├── middleware/
│   └── cors.ts
├── modules/
│   └── health/
│       ├── health.route.ts
│       ├── health.schema.ts
│       └── health.test.ts
├── app.ts
└── server.ts
```

`app.ts` will compose global middleware and mount feature modules. `server.ts` will be the process entry point and will only handle server startup. New capabilities such as games, lobbies, players, and cards can later be added as sibling modules without expanding the application entry point.

The scaffold will expose `GET /api/health`, returning a small typed JSON response. The port will come from `PORT`, with `3000` as the local default. CORS will allow origins listed in `CORS_ORIGIN`, with `http://localhost:5173` as the local default.

## Data Flow and Failure Behavior

On page load, the React application will call its API client, which requests `GET /api/health`. Hono will route the request to the health module and return JSON. The frontend will render either a connected state or a non-fatal “Backend unavailable” state.

Invalid environment values will fall back to documented local defaults where safe. Unhandled backend errors will produce JSON responses without exposing stack traces. A failed frontend request will be caught and represented in the interface instead of causing an unhandled rejection.

## Local Developer Workflow

The root scripts will provide:

- A setup command that installs frontend and backend dependencies
- A development command that starts both processes and forwards termination signals
- A check command that runs backend tests and TypeScript checks plus the frontend production build
- A build command for production validation

The applications will remain directly runnable from their own directories, so the root tooling is optional convenience rather than a deployment requirement.

## Deployment

Vercel will import the Git repository with `frontend` as its Root Directory. It will use the Vite build and receive `VITE_API_URL` as an environment variable containing the public Render URL.

Render will create a web service from the same repository with `backend` as its Root Directory. Its start command will launch the Bun server. Render will provide `PORT`; `CORS_ORIGIN` will contain the deployed Vercel origin.

Deployment instructions will be documented in the repository README. No cloud resources will be created during this scaffold milestone.

## Verification

The backend health route will be tested through the composed Hono application using Bun’s test runner. TypeScript checking will cover backend source code. The frontend will be verified with Vite’s production build, which includes TypeScript compilation.

After static verification passes, both development servers will be started together. The smoke check will confirm that the backend returns a successful health response and that the frontend is served on its expected port.

## Explicitly Out of Scope

- UNO rules or card logic
- Multiplayer sessions, matchmaking, or persistence
- Authentication or user profiles
- WebSockets or real-time synchronization
- Production deployment or domain setup
- A finished game interface
