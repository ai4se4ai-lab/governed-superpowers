import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { loadSkills } from "./skills.js";
import { buildBootstrapInstructions } from "./bootstrap.js";
import { registerSkillResources } from "./resources.js";
import { registerSkillPrompts } from "./prompts.js";
import { registerSkillTools } from "./tools.js";

export const SERVER_NAME = "governed-superpowers";
export const SERVER_VERSION = "0.1.0";

/**
 * Builds one fresh McpServer instance for a client session: loads skills
 * from disk, registers resources/prompts/tools, and sets `instructions` to
 * the bootstrap briefing (skills/using-superpowers/SKILL.md +
 * references/mcp-tools.md) so it's returned automatically at `initialize`.
 */
export function buildServer(skillsDir: string): McpServer {
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

  return server;
}
