# syntax=docker/dockerfile:1

# ---------- 1) Frontend bauen ----------
FROM node:22-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---------- 2) Server-Abhängigkeiten ----------
FROM node:22-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------- 3) Laufzeit-Image ----------
FROM node:22-alpine
# git für den optionalen Git-Export, tzdata damit Sicherungszeiten der Zeitzone (TZ) folgen
RUN apk add --no-cache git tzdata
ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    PUBLIC_DIR=/app/public
WORKDIR /app/server
COPY --from=server-deps /app/server/node_modules ./node_modules
COPY server/ ./
COPY --from=client /app/client/dist /app/public
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3000
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1
CMD ["node", "src/index.js"]
