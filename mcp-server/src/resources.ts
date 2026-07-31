import { readFileSync } from "node:fs";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Skill } from "./skills.js";

function mimeTypeFor(relativePath: string): string {
  return relativePath.endsWith(".md") || relativePath.endsWith(".dot") || relativePath.endsWith(".ts")
    ? "text/markdown"
    : "text/plain";
}

// A skill file's relative path can contain '/' (e.g. "scripts/server.cjs"),
// but a single {variable} segment in an RFC6570 URI template only matches
// one path segment. Rather than depend on reserved ("+") expansion support
// (unconfirmed for this SDK version), encode the whole relative path as one
// opaque segment and resolve it via a lookup table built at startup - both
// sides of the mapping are owned by this file, so the delimiter only needs
// to be internally consistent, not a real URI-template feature.
const SEGMENT_DELIMITER = "::";

function encodeFileId(relativePath: string): string {
  return relativePath.split("/").join(SEGMENT_DELIMITER);
}

function decodeFileId(fileId: string): string {
  return fileId.split(SEGMENT_DELIMITER).join("/");
}

/**
 * Registers every skill file (SKILL.md plus everything under its
 * references/scripts/templates subdirectories) as a readable MCP resource
 * at `skill://<skill-name>/<encoded-relative-path>`, mirroring exactly what
 * the `Skill` tool loads on Claude Code. `get_skill` (see tools.ts) lists
 * the human-readable relative path alongside each resource's URI.
 */
export function registerSkillResources(server: McpServer, skills: Skill[]): void {
  const template = new ResourceTemplate("skill://{skillName}/{fileId}", {
    list: async () => ({
      resources: skills.flatMap((skill) =>
        skill.files.map((file) => ({
          uri: `skill://${skill.name}/${encodeFileId(file.relativePath)}`,
          name: `${skill.name}/${file.relativePath}`,
          title: `${skill.name}: ${file.relativePath}`,
          mimeType: mimeTypeFor(file.relativePath),
        }))
      ),
    }),
  });

  server.registerResource(
    "skill-file",
    template,
    {
      title: "Skill file",
      description: "A file belonging to a governed-superpowers skill (SKILL.md or a reference/script/template).",
    },
    async (uri, variables) => {
      const skillName = String(variables.skillName);
      const filePath = decodeFileId(String(variables.fileId));

      const skill = skills.find((candidate) => candidate.name === skillName);
      if (!skill) {
        throw new Error(`Unknown skill '${skillName}'`);
      }
      const file = skill.files.find((candidate) => candidate.relativePath === filePath);
      if (!file) {
        throw new Error(`Skill '${skillName}' has no file '${filePath}'`);
      }

      return {
        contents: [
          {
            uri: uri.href,
            text: readFileSync(file.absolutePath, "utf-8"),
            mimeType: mimeTypeFor(filePath),
          },
        ],
      };
    }
  );
}

export { encodeFileId };
