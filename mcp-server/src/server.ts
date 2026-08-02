import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadSkills } from "./skills.js";
import { buildBootstrapInstructions } from "./bootstrap.js";
import { registerSkillResources } from "./resources.js";
import { registerSkillPrompts } from "./prompts.js";
import { registerSkillTools, registerGraphTools } from "./tools.js";
import type { GraphStore } from "./graphs.js";

export const SERVER_NAME = "governed-superpowers";
export const SERVER_VERSION = "0.1.0";

/**
 * Per-session dependencies. The graph tools write user-owned rows, so the
 * identity behind the session's bearer token is bound in at build time rather
 * than read per-call - a tool handler has no access to the HTTP request.
 */
export type ServerDeps = {
  userId: string;
  graphStore?: GraphStore;
};

/**
 * Builds one fresh McpServer instance for a client session: loads skills
 * from disk, registers resources/prompts/tools, and sets `instructions` to
 * the bootstrap briefing (skills/using-governed-superpowers/SKILL.md +
 * references/mcp-tools.md) so it's returned automatically at `initialize`.
 *
 * `deps` is optional so existing tests that only exercise the read-only skill
 * surface keep working; without a graphStore the publish tools aren't
 * registered at all, which is the right behaviour for a server started with no
 * database-backed store.
 */
export function buildServer(skillsDir: string, deps?: ServerDeps): McpServer {
  const skills = loadSkills(skillsDir);
  const instructions = buildBootstrapInstructions(skills);

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions,
      capabilities: {
        resources: { listChanged: false },
        prompts: { listChanged: false },
        tools: { listChanged: false },
      },
    }
  );

  registerSkillResources(server, skills);
  registerSkillPrompts(server, skills);
  registerSkillTools(server, skills, instructions);

  if (deps?.graphStore) {
    registerGraphTools(server, deps.graphStore, deps.userId);
  }

  return server;
}
