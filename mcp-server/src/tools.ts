import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { findSkill, searchSkills, type Skill } from "./skills.js";
import { encodeFileId } from "./resources.js";
import {
  GraphPublishError,
  PROVENANCE_SOURCES,
  SUBSTATE_STATUSES,
  type GraphStore,
  type PublishGraphInput,
  type RevokeInput,
} from "./graphs.js";

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

// ---------------------------------------------------------------------------
// Collaboration graphs
// ---------------------------------------------------------------------------

const consentSchema = z.object({
  version: z.literal(1),
  project: z.object({
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits and hyphens only"),
    name: z.string().min(1).max(120),
    originHash: z.string().min(1).max(80),
  }),
  scope: z.object({
    specPaths: z.boolean(),
    substateTitles: z.boolean(),
    changePaths: z.boolean(),
    annotationText: z.boolean(),
  }),
  grantedAt: z.string().min(1).max(40),
  grantedBy: z.string().max(200),
  revokedAt: z.string().max(40).nullable(),
});

const sourceSchema = z.object({
  marker: z.string().max(10).nullable().optional(),
  source: z.enum(PROVENANCE_SOURCES),
  ref: z.string().max(500).nullable().optional(),
  text: z.string().max(2000).nullable().optional(),
});

const substateSchema = z.object({
  key: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  status: z.enum(SUBSTATE_STATUSES).nullable().optional(),
  changes: z
    .array(z.object({ path: z.string().max(400), summary: z.string().max(400) }))
    .max(100)
    .optional(),
  commits: z.array(z.string().max(64)).max(50).optional(),
  notes: z.string().max(2000).nullable().optional(),
  sources: z.array(sourceSchema).max(200).optional(),
});

const stateSchema = z.object({
  key: z.string().min(1).max(80),
  label: z.string().min(1).max(160),
  summary: z.string().max(600).nullable().optional(),
  substates: z.array(substateSchema).min(1).max(50),
});

const edgeSchema = z.object({ from: z.string().min(1).max(200), to: z.string().min(1).max(200) });

function errorResult(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/**
 * Registers the tools that publish a project's collaboration graph to the
 * account portal, where it renders as a sheet-tab in the Graphs view.
 *
 * `userId` is bound at session-build time from the bearer token (see
 * app.ts) - a tool handler never sees the HTTP request, so identity cannot be
 * taken from the payload.
 */
export function registerGraphTools(server: McpServer, store: GraphStore, userId: string): void {
  server.registerTool(
    "publish_graph",
    {
      title: "Publish collaboration graph",
      description:
        "Publish one spec's human-AI collaboration graph to the account portal. Requires the consent " +
        "record from the project's .governed-superpowers/sharing.json - never call this without first " +
        "confirming with your human partner. Re-publishing the same spec path replaces its graph but " +
        "preserves any sheet-tab title they have set. Note: this server cannot read your disk, so it " +
        "verifies the consent record is well-formed and unrevoked, not that it genuinely exists.",
      inputSchema: {
        consent: consentSchema,
        spec: z.object({
          path: z.string().min(1).max(400).describe("Repo-relative path of the spec .md."),
          title: z.string().min(1).max(120).describe("Sheet-tab label, used only on first publish."),
          planPath: z.string().max(400).nullable().optional(),
        }),
        states: z.array(stateSchema).min(1).max(20),
        stateEdges: z.array(edgeSchema).max(100).optional(),
        substateEdges: z
          .array(edgeSchema)
          .max(400)
          .optional()
          .describe('Endpoints are "<stateKey>/<substateKey>".'),
        annotationCoverage: z
          .object({ mapped: z.number().int().nonnegative(), total: z.number().int().nonnegative() })
          .optional()
          .describe("How many sidecar annotations were matched to a substate, out of how many exist."),
      },
    },
    async (args) => {
      try {
        const result = await store.publishGraph(userId, args as unknown as PublishGraphInput);

        const lines = [
          `Published "${result.specTitle}" (${result.specPath}) to project '${result.projectSlug}'.`,
          `${result.states} states, ${result.substates} substates, ${result.sources} provenance sources.`,
        ];
        if (!result.created) {
          lines.push(`Existing sheet tab updated; its title "${result.specTitle}" was left as your human partner set it.`);
        }
        if (result.annotationCoverage) {
          const { mapped, total } = result.annotationCoverage;
          lines.push(
            total === 0
              ? "No annotations sidecar was found, so every substate will render as 'no provenance data'."
              : `${mapped} of ${total} annotations mapped to a substate.` +
                  (mapped < total ? " The unmapped ones were dropped, not reassigned." : "")
          );
        }
        return textResult(lines.join("\n"));
      } catch (error) {
        if (error instanceof GraphPublishError) return errorResult(error.message);
        console.error("publish_graph failed", error);
        return errorResult("Could not publish the graph. The portal's database rejected the write.");
      }
    }
  );

  server.registerTool(
    "list_published_graphs",
    {
      title: "List published graphs",
      description:
        "List every collaboration graph published under this token's account, with what was shared and when. " +
        "Use it to show your human partner exactly what has left their machine.",
    },
    async () => {
      try {
        const projects = await store.listGraphs(userId);
        if (projects.length === 0) return textResult("No graphs have been published from this account.");

        const lines = projects.flatMap((project) => [
          `# ${project.name} (${project.slug})`,
          `  consent granted ${project.consentGrantedAt.toISOString()} - scope: ${
            Object.entries(project.scope)
              .filter(([, on]) => on)
              .map(([field]) => field)
              .join(", ") || "nothing"
          }`,
          ...(project.specs.length === 0
            ? ["  (no specs published)"]
            : project.specs.map(
                (spec) =>
                  `  - ${spec.title} [${spec.specPath}] - ${spec.states} states, ${spec.substates} substates, ` +
                  `${spec.sources} sources, last published ${spec.lastPublishedAt.toISOString()}`
              )),
        ]);
        return textResult(lines.join("\n"));
      } catch (error) {
        console.error("list_published_graphs failed", error);
        return errorResult("Could not read the published graphs.");
      }
    }
  );

  server.registerTool(
    "revoke_published_graph",
    {
      title: "Revoke published graph",
      description:
        "Delete a published graph from the account portal - one spec, or the whole project with all: true. " +
        "Use this when your human partner withdraws consent.",
      inputSchema: {
        projectSlug: z.string().min(1).max(80),
        specPath: z.string().max(400).optional(),
        all: z.boolean().optional().describe("Delete every spec in the project, and the project itself."),
      },
    },
    async ({ projectSlug, specPath, all }) => {
      if (!all && !specPath) {
        return errorResult("Pass either specPath, or all: true to remove the whole project.");
      }

      try {
        const result = await store.revokeGraph(
          userId,
          (all ? { projectSlug, all: true } : { projectSlug, specPath }) as RevokeInput
        );

        if (result.removedSpecs === 0 && !result.removedProject) {
          return textResult(`Nothing to remove - no such project or spec under this account.`);
        }
        return textResult(
          `Removed ${result.removedSpecs} spec graph(s)` +
            (result.removedProject ? ` and the project '${projectSlug}' itself.` : ".")
        );
      } catch (error) {
        console.error("revoke_published_graph failed", error);
        return errorResult("Could not revoke the published graph.");
      }
    }
  );
}
