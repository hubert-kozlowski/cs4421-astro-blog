# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM build-dependencies AS build

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS production-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV NFL_DATA_DIR=/app/data

COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir -p /app/data && chown node:node /app/data

USER node
VOLUME ["/app/data"]
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:4321/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "./dist/server/entry.mjs"]