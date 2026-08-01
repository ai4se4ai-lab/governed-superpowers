import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Skill } from "./skills.js";

/**
 * Registers one MCP prompt per skill. Invoking `prompts/get` for a skill's
 * name returns its full SKILL.md body as a single user-role prompt message -
 * the direct MCP equivalent of Claude Code's `Skill` tool call.
 */
export function registerSkillPrompts(server: McpServer, skills: Skill[]): void {
  for (const skill of skills) {
    server.registerPrompt(
      skill.name,
      {
        title: skill.name,
        description: skill.description,
      },
      () => ({
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: skill.body,
            },
          },
        ],
      })
    );
  }
}
