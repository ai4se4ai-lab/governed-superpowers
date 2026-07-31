import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { SERVER_NAME, SERVER_VERSION } from "./server.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT ?? 3000);
const MCP_SERVER_TOKEN = process.env.MCP_SERVER_TOKEN;
// __dirname at runtime is mcp-server/dist, so the repo-root skills/ dir
// (the sibling of mcp-server/) is two levels up, not one.
const SKILLS_DIR = resolve(process.env.SKILLS_DIR ?? join(__dirname, "..", "..", "skills"));

if (!MCP_SERVER_TOKEN) {
  console.error("MCP_SERVER_TOKEN is not set. Refusing to start an unauthenticated internet-facing server.");
  console.error("Generate one with: openssl rand -hex 32");
  process.exit(1);
}

if (!existsSync(join(SKILLS_DIR, "using-superpowers", "SKILL.md"))) {
  console.error(`SKILLS_DIR (${SKILLS_DIR}) does not contain skills/using-superpowers/SKILL.md.`);
  console.error("Set the SKILLS_DIR env var to the governed-superpowers 'skills' directory.");
  process.exit(1);
}

const app = createApp(SKILLS_DIR, MCP_SERVER_TOKEN);

app.listen(PORT, () => {
  console.log(`${SERVER_NAME} v${SERVER_VERSION} listening on :${PORT} (skills: ${SKILLS_DIR})`);
});
