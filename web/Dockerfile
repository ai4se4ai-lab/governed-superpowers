# Build context is ./web - this image needs nothing from the repo root.
#
# Two runnable targets:
#   --target runtime  (default) the Next.js server, standalone and minimal
#   --target migrator            the Prisma CLI, used by the one-shot
#                                `migrate` service in docker-compose.yml

FROM node:22-alpine AS deps
# Prisma's query engine is dynamically linked against OpenSSL on musl.
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `npm run build` runs `prisma generate` first - see web/package.json.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Runs `prisma migrate deploy`. Needs the full dependency tree: the Prisma CLI
# pulls in transitive packages (effect, @prisma/config, ...) that cannot be
# cherry-picked into the standalone tree.
FROM node:22-alpine AS migrator
RUN apk add --no-cache openssl
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# `output: "standalone"` emits a self-contained server.js plus the minimal
# node_modules it needs, but it does NOT copy public/ or .next/static - those
# have to come across explicitly or every asset 404s.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "server.js"]
