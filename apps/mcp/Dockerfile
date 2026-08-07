# TriggersAPI — MCP server image (Streamable HTTP transport).
# Build context is the repo root.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.0

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile

ENV NODE_ENV=production
ENV MCP_HTTP_HOST=0.0.0.0
ENV MCP_HTTP_PORT=3100

EXPOSE 3100

# Talks to the API over HTTP only — no database or Redis access required.
CMD ["pnpm", "--filter", "@triggers/mcp", "start"]
