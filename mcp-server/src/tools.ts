import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findSkill, searchSkills, type Skill } from "./skills.js";
import { encodeFileId } from "./resources.js";

function skillSummaryText(skill: Skill): string {
  return `${skill.name} - ${skill.description}`;
}

function skillDetailText(skill: Skill): string {
  const fileList = skill.files
    .map((file) => `  - ${file.relativePath} (skill://${skill.name}/${encodeFileId(file.relativePath)})`)
    .join("\n");
  return [
    `# ${skill.name}`,
    "",
    skill.description,
    "",
    "## Files",
    fileList || "  (only SKILL.md)",
    "",
    "## Body",
    "",
    skill.body,
  ].join("\n");
}

/**
 * Registers the tool-based fallback surface for clients whose UI doesn't
 * expose MCP prompts/instructions well: list_skills, get_skill,
 * search_skills, get_bootstrap. See skills/using-superpowers/references/
 * mcp-tools.md for how these map onto the skill vocabulary.
 */
export function registerSkillTools(server: McpServer, skills: Skill[], bootstrapInstructions: string): void {
  server.registerTool(
    "list_skills",
    {
      title: "List skills",
      description: "List every governed-superpowers skill with its one-line description.",
    },
    async () => ({
      content: [
        {
          type: "text",
          text: skills.map(skillSummaryText).join("\n"),
        },
      ],
    })
  );

  server.registerTool(
    "get_skill",
    {
      title: "Get skill",
      description:
        "Fetch a governed-superpowers skill's full body and the list of its reference/script/template files by name.",
      inputSchema: {
        name: z.string().describe("Exact skill name, e.g. 'brainstorming' or 'systematic-debugging'."),
      },
    },
    async ({ name }) => {
      const skill = findSkill(skills, name);
      if (!skill) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `No skill named '${name}'. Call list_skills or search_skills to find the right name.`,
            },
          ],
        };
      }
      return { content: [{ type: "text", text: skillDetailText(skill) }] };
    }
  );

  server.registerTool(
    "search_skills",
    {
      title: "Search skills",
      description: "Keyword search across every skill's name, description, and body.",
      inputSchema: {
        query: z.string().describe("Keyword or phrase to search for."),
      },
    },
    async ({ query }) => {
      const matches = searchSkills(skills, query);
      return {
        content: [
          {
            type: "text",
            text: matches.length
              ? matches.map(skillSummaryText).join("\n")
              : `No skills matched '${query}'.`,
          },
        ],
      };
    }
  );

  server.registerTool(
    "get_bootstrap",
    {
      title: "Get bootstrap",
      description:
        "Return the governed-superpowers bootstrap briefing (same content as this server's 'instructions'), " +
        "for clients that don't surface MCP server instructions to the model automatically.",
    },
    async () => ({ content: [{ type: "text", text: bootstrapInstructions }] })
  );
}
