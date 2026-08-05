# TriggersAPI — maintenance worker image. Build context is the repo root.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.0

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate

ENV NODE_ENV=production

# The API applies migrations; the worker just waits for the schema via retries.
CMD ["pnpm", "--filter", "@triggers/worker", "start"]
