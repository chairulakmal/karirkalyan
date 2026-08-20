# syntax=docker/dockerfile:1
# check=error=true

# Self-hosted production image (Docker + Cloudflare Tunnel). Railway builds this
# tree with Railpack instead and never reads this file; see the header comment on
# api/Dockerfile for the equivalent note on that side.

ARG NODE_VERSION=24
FROM docker.io/library/node:$NODE_VERSION-slim AS base

WORKDIR /app

# ── Build stage ────────────────────────────────────────────────────────────────
FROM base AS build

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Final stage ────────────────────────────────────────────────────────────────
FROM base

RUN apt-get update -qq && \
    apt-get install --no-install-recommends -y curl && \
    rm -rf /var/lib/apt/lists /var/cache/apt/archives

# The base image already ships a uid/gid-1000 "node" user; api/Dockerfile
# creates its own "rails" one because the ruby:slim base has no equivalent.
USER node

ENV NODE_ENV="production" \
    HOSTNAME="0.0.0.0"

# next.config.ts sets output: "standalone", so .next/standalone carries its own
# minimal node_modules and only these three paths are needed at runtime.
COPY --chown=node:node --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static
COPY --chown=node:node --from=build /app/public ./public

EXPOSE 3000

# There is no dedicated health route (adding app surface for orchestration alone
# would be new capability under the v1 freeze); the sign-in page already renders
# dynamically per request, so a 200 on "/" proves the Node process, next-intl's
# locale routing, and proxy.ts's guard are all actually working, not just booted.
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD curl -f http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
