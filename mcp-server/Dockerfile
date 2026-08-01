# Build context MUST be the repo root (not mcp-server/), so this stage can
# COPY the sibling `skills/` directory the server serves at runtime.
# docker-compose.yml at the repo root is set up for this already.

FROM node:22-alpine AS builder
WORKDIR /app/mcp-server

COPY mcp-server/package.json mcp-server/package-lock.json ./
RUN npm ci

COPY mcp-server/tsconfig.json ./
COPY mcp-server/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app/mcp-server

COPY mcp-server/package.json mcp-server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/mcp-server/dist ./dist
COPY skills /app/skills

ENV SKILLS_DIR=/app/skills
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "dist/index.js"]
