# Triggers API

A Node + TypeScript HTTP API service.

## Requirements

- Node.js >= 20

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

The server starts on `http://localhost:3000` by default. Verify it:

```bash
curl http://localhost:3000/health
```

## Scripts

| Script               | Description                           |
| -------------------- | ------------------------------------- |
| `npm run dev`        | Start the server in watch mode (tsx). |
| `npm run build`      | Compile TypeScript to `dist/`.        |
| `npm start`          | Run the compiled server from `dist/`. |
| `npm test`           | Run the test suite once (Vitest).     |
| `npm run test:watch` | Run tests in watch mode.              |
| `npm run lint`       | Lint with ESLint.                     |
| `npm run lint:fix`   | Lint and auto-fix.                    |
| `npm run format`     | Format with Prettier.                 |
| `npm run typecheck`  | Type-check without emitting.          |

## Project structure

```
src/
├── config/
│   └── env.ts            # Environment validation (zod), fails fast
├── middleware/
│   └── errorHandler.ts   # 404 + central error handling
├── routes/
│   └── health.ts         # GET /health liveness probe
├── server.ts             # Builds the Express app (no port binding)
└── index.ts              # Entry point: loads env, listens, graceful shutdown
test/
└── health.test.ts        # HTTP tests via supertest
```

`createApp()` is kept separate from the entry point so tests can import the
app without starting a listener.

## Configuration

Environment variables are validated at startup in [`src/config/env.ts`](src/config/env.ts):

| Variable   | Default       | Description                              |
| ---------- | ------------- | ---------------------------------------- |
| `PORT`     | `3000`        | Port the HTTP server listens on.         |
| `NODE_ENV` | `development` | `development` \| `test` \| `production`. |
