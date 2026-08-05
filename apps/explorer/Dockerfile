# TriggersAPI — Explorer UI. Multi-stage: build with Vite, serve with nginx.
FROM node:22-slim AS build
RUN npm install -g pnpm@9.15.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @triggers/explorer build

FROM nginx:alpine
COPY apps/explorer/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/explorer/dist /usr/share/nginx/html
EXPOSE 80
