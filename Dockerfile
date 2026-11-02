# syntax=docker/dockerfile:1

# Stage 1: Build the React app
FROM oven/bun:1 AS builder
WORKDIR /app

# Install dependencies. A frozen install needs the manifest of every workspace the
# lockfile lists (the apps in apps/ and the libraries in packages/), so each is copied
# before the cached install layer.
COPY package.json bun.lock* bunfig.toml ./
COPY apps/dashboard/package.json ./apps/dashboard/
COPY apps/weather-clock/package.json ./apps/weather-clock/
COPY apps/weather-map/package.json ./apps/weather-map/
COPY packages/ambient/package.json ./packages/ambient/
COPY packages/radar/package.json ./packages/radar/
COPY packages/relay/package.json ./packages/relay/
COPY packages/ui/package.json ./packages/ui/
COPY packages/weather/package.json ./packages/weather/
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build:dashboard && bun run build:server

# ─────────────────────────────────────────────────────────────────────────────

# Stage 2: Serve with a minimal Node.js server, bundled into one dependency-free file
FROM node:20-alpine AS runner
WORKDIR /app

# Copy built assets and the bundled server
COPY --from=builder /app/apps/dashboard/dist ./dist
COPY --from=builder /app/apps/dashboard/server-dist/server.js .

EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
