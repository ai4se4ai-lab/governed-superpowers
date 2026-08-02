import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Skill } from "./skills.js";

const BOOTSTRAP_SKILL_NAME = "using-governed-superpowers";
const MCP_TOOLS_REFERENCE = "references/mcp-tools.md";

/**
 * Builds the MCP server's `instructions` string: the bootstrap skill's body
 * (the same content injected by the SessionStart hook on Claude Code/Cursor)
 * plus this harness's tool-mapping reference appended, so an MCP client gets
 * the full "how skills work here" briefing with no per-session opt-in - MCP
 * clients fetch `instructions` automatically at `initialize` time.
 */
export function buildBootstrapInstructions(skills: Skill[]): string {
  const bootstrapSkill = skills.find((skill) => skill.name === BOOTSTRAP_SKILL_NAME);
  if (!bootstrapSkill) {
    throw new Error(
      `Bootstrap skill '${BOOTSTRAP_SKILL_NAME}' not found among loaded skills - ` +
        "check that skills/using-governed-superpowers/SKILL.md still declares that frontmatter name."
    );
  }

  const toolMappingPath = join(bootstrapSkill.dir, MCP_TOOLS_REFERENCE);
  const toolMapping = readFileSync(toolMappingPath, "utf-8").trim();

  return [
    "You have governed-superpowers, served over MCP.",
    "",
    "Below is the full content of the 'using-governed-superpowers' skill - " +
      "your introduction to using skills. For all other skills, call the " +
      "matching MCP prompt or the 'get_skill' tool by name.",
    "",
    bootstrapSkill.body,
    "",
    "---",
    "",
    toolMapping,
  ].join("\n");
}
