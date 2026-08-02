import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { createPool, createTokenVerifier } from "./db.js";
import { createGraphStore } from "./graphs.js";
import { SERVER_NAME, SERVER_VERSION } from "./server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3000);
const DATABASE_URL = process.env.DATABASE_URL;
// __dirname at runtime is mcp-server/dist, so the repo-root skills/ dir
// (the sibling of mcp-server/) is two levels up, not one.
const SKILLS_DIR = resolve(process.env.SKILLS_DIR ?? join(__dirname, "..", "..", "skills"));

if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Refusing to start an unauthenticated internet-facing server.");
  console.error("Tokens are issued by the account portal (see web/) and validated against its database.");
  process.exit(1);
}

if (!existsSync(join(SKILLS_DIR, "using-governed-superpowers", "SKILL.md"))) {
  console.error(`SKILLS_DIR (${SKILLS_DIR}) does not contain skills/using-governed-superpowers/SKILL.md.`);
  console.error("Set the SKILLS_DIR env var to the governed-superpowers 'skills' directory.");
  process.exit(1);
}

const pool = createPool(DATABASE_URL);

// A pool-level error (Postgres restarting, network blip) is emitted on the
// pool rather than a query promise. Without a listener it would crash the
// process; individual queries still reject and are handled at the call site.
pool.on("error", (error) => {
  console.error("Postgres pool error", error);
});

const app = createApp(SKILLS_DIR, createTokenVerifier(pool), createGraphStore(pool));

const server = app.listen(PORT, () => {
  console.log(`${SERVER_NAME} v${SERVER_VERSION} listening on :${PORT} (skills: ${SKILLS_DIR})`);
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    server.close(() => {
      void pool.end().finally(() => process.exit(0));
    });
  });
}
