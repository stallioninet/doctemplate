# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim

# Chromium runtime libs for Puppeteer's bundled browser. We let Puppeteer
# download its own version-matched Chromium during `npm install` rather than
# install system chromium — fewer compatibility surprises on upgrades.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation \
    libasound2 libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 \
    libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libglib2.0-0 \
    libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
    libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
    libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 \
    libxss1 libxtst6 wget xdg-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace manifests first for Docker layer caching — re-installs only
# trigger when these files change.
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/

# Install backend workspace deps (frontend workspace is skipped). Includes
# devDeps because we need `prisma`, `tsc` and `@types/*` to build below.
RUN npm install --include=dev --workspace=@doctemplate/backend

# Copy backend source + Prisma schema, generate the typed client, compile TS.
COPY apps/backend ./apps/backend
RUN npm run prisma:generate --workspace=@doctemplate/backend
RUN npm run build --workspace=@doctemplate/backend

# Persistent storage mount point — Render mounts the 10GB disk here at boot.
RUN mkdir -p /storage

ENV NODE_ENV=production \
    STORAGE_ROOT=/storage \
    PORT=3001

EXPOSE 3001

# On every boot: sync schema (idempotent if already in sync) then start the
# server. `db push` is fine for early-stage; switch to `migrate deploy` once
# you're tracking migration files.
CMD ["sh", "-c", "npx --workspace=@doctemplate/backend prisma db push --skip-generate --accept-data-loss && npm run start --workspace=@doctemplate/backend"]
