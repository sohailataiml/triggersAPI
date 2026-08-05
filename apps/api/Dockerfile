# TriggersAPI — API service image. Build context is the repo root.
FROM node:22-slim

# openssl is required by Prisma's query engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.0

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm db:generate

ENV NODE_ENV=production
EXPOSE 3000

# Apply migrations (idempotent) then start the API.
CMD ["sh", "-c", "pnpm db:deploy && pnpm --filter @triggers/api start"]
