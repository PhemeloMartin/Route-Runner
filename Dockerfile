# syntax=docker/dockerfile:1.7
# Route Runner - multi-stage image: build & test -> production dependencies -> slim non-root runtime.

# ---------- 1. build: install everything, run the test suite, build client + server ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/content/package.json packages/content/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm test && npm run build

# ---------- 2. prod-deps: only the server's runtime dependencies ----------
FROM node:20-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/content/package.json packages/content/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN npm ci --omit=dev --workspace @route-runner/server --no-audit --no-fund

# ---------- 3. runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=7420 \
    ROUTE_RUNNER_DATA=/data \
    LOG_LEVEL=info
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/client/dist ./apps/client/dist
COPY --from=build /app/data/seed ./data/seed
RUN mkdir -p /data && chown -R node:node /data
USER node
EXPOSE 7420
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/server/dist/index.js"]
