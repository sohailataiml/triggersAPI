# Zapier AI Automation Copilot — agent backend + built SPA.
# Build context is the repo root.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@9.15.0

WORKDIR /app
COPY . .

RUN pnpm install --frozen-lockfile
# The backend serves the SPA in production, keeping the browser same-origin
# with the API so no credential ever crosses an origin boundary.
RUN pnpm --filter @triggers/copilot exec vite build

ENV NODE_ENV=production
ENV COPILOT_HOST=0.0.0.0
ENV COPILOT_PORT=3200

EXPOSE 3200

# Talks to the MCP server over HTTP; no database or Redis access.
CMD ["pnpm", "--filter", "@triggers/copilot", "start"]
