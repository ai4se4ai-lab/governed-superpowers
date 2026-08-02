import { randomUUID } from "node:crypto";

/**
 * Collaboration-graph storage for the publish_graph tool family.
 *
 * Like db.ts, this deliberately does NOT use Prisma - the table and column
 * names below are the contract with web/prisma/schema.prisma, and renaming
 * them there means changing them here too.
 *
 * A publish is authoritative for the shape of one spec's graph: everything
 * below the GraphSpec row is deleted and rewritten. The only fields the user
 * owns - the sheet-tab title and its position - live on the GraphSpec row
 * itself and are never touched by a re-publish. See publishGraph().
 */

// ---------------------------------------------------------------------------
// Payload types (the wire contract; tools.ts holds the matching Zod schemas)
// ---------------------------------------------------------------------------

export const PROVENANCE_SOURCES = [
  "human",
  "ai_assumption",
  "skill_doc",
  "tool_output",
  "existing_codebase",
  "external_reference",
] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

export const SUBSTATE_STATUSES = ["DONE", "DONE_WITH_CONCERNS", "BLOCKED"] as const;
export type SubstateStatus = (typeof SUBSTATE_STATUSES)[number];

export type ConsentScope = {
  specPaths: boolean;
  substateTitles: boolean;
  changePaths: boolean;
  annotationText: boolean;
};

export type Consent = {
  version: 1;
  project: { slug: string; name: string; originHash: string };
  scope: ConsentScope;
  grantedAt: string;
  grantedBy: string;
  revokedAt: string | null;
};

export type SourceInput = {
  marker?: string | null;
  source: ProvenanceSource;
  ref?: string | null;
  text?: string | null;
};

export type ChangeInput = { path: string; summary: string };

export type SubstateInput = {
  key: string;
  title: string;
  status?: SubstateStatus | null;
  changes?: ChangeInput[];
  commits?: string[];
  notes?: string | null;
  sources?: SourceInput[];
};

export type StateInput = {
  key: string;
  label: string;
  summary?: string | null;
  substates: SubstateInput[];
};

export type EdgeInput = { from: string; to: string };

export type PublishGraphInput = {
  consent: Consent;
  spec: { path: string; title: string; planPath?: string | null };
  states: StateInput[];
  stateEdges?: EdgeInput[];
  substateEdges?: EdgeInput[];
  annotationCoverage?: { mapped: number; total: number };
};

export type PublishResult = {
  projectSlug: string;
  specPath: string;
  specTitle: string;
  /** False when this spec already had a sheet-tab, so its title was preserved. */
  created: boolean;
  states: number;
  substates: number;
  sources: number;
  stateEdges: number;
  substateEdges: number;
  annotationCoverage?: { mapped: number; total: number };
};

export type RevokeInput =
  | { projectSlug: string; specPath: string; all?: false }
  | { projectSlug: string; all: true; specPath?: undefined };

export type RevokeResult = { removedSpecs: number; removedProject: boolean };

export type SpecSummary = {
  specPath: string;
  title: string;
  states: number;
  substates: number;
  sources: number;
  lastPublishedAt: Date;
};

export type ProjectSummary = {
  slug: string;
  name: string;
  consentGrantedAt: Date;
  scope: ConsentScope;
  specs: SpecSummary[];
};

/** Raised for anything the caller can fix; tools.ts turns it into isError. */
export class GraphPublishError extends Error {}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface ClientLike {
  query(text: string, values?: unknown[]): Promise<{ rows: any[] }>;
  release(): void;
}

export interface PoolLike {
  connect(): Promise<ClientLike>;
}

export interface GraphStore {
  publishGraph(userId: string, input: PublishGraphInput): Promise<PublishResult>;
  listGraphs(userId: string): Promise<ProjectSummary[]>;
  revokeGraph(userId: string, input: RevokeInput): Promise<RevokeResult>;
}

/** How long a consent grant stays good before the agent must ask again. */
const CONSENT_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Rejects a payload that doesn't match the consent it travels with.
 *
 * Be honest about what this is: this server cannot read the user's disk, so it
 * cannot confirm that .governed-superpowers/sharing.json exists or says what
 * the payload claims. A misbehaving client could fabricate the whole block.
 * What this does guarantee is that every stored graph carries a well-formed,
 * unexpired, unrevoked consent record whose declared scope matches the fields
 * actually present - an accountability trail, not an access control.
 */
export function assertConsent(input: PublishGraphInput, now = Date.now()): void {
  const { consent } = input;

  if (consent.revokedAt !== null) {
    throw new GraphPublishError(
      "Consent for this project has been revoked. Ask your human partner before publishing again."
    );
  }

  const grantedAt = Date.parse(consent.grantedAt);
  if (Number.isNaN(grantedAt)) {
    throw new GraphPublishError("consent.grantedAt is not a valid ISO-8601 timestamp.");
  }
  if (grantedAt > now + 60_000) {
    throw new GraphPublishError("consent.grantedAt is in the future.");
  }
  if (now - grantedAt > CONSENT_MAX_AGE_MS) {
    throw new GraphPublishError(
      "This consent grant is over a year old. Ask your human partner to renew it before publishing."
    );
  }

  const { scope } = consent;

  // Each scope flag is a per-field opt-in. Publishing a field the user declined
  // is refused outright rather than quietly stripped - a silent strip would let
  // an over-broad payload look like it succeeded as sent.
  if (!scope.specPaths && input.spec.path) {
    throw new GraphPublishError("consent.scope.specPaths is false but spec.path was sent.");
  }

  for (const state of input.states) {
    for (const substate of state.substates) {
      if (!scope.substateTitles && substate.title) {
        throw new GraphPublishError(
          `consent.scope.substateTitles is false but substate '${substate.key}' carries a title.`
        );
      }
      if (!scope.changePaths && substate.changes?.length) {
        throw new GraphPublishError(
          `consent.scope.changePaths is false but substate '${substate.key}' carries changed paths.`
        );
      }
      if (!scope.annotationText && substate.sources?.some((s) => s.text)) {
        throw new GraphPublishError(
          `consent.scope.annotationText is false but substate '${substate.key}' carries annotation text.`
        );
      }
    }
  }
}

/** Splits sources into the two counters that drive colour, plus the rest. */
export function countSources(sources: readonly SourceInput[] = []): {
  humanCount: number;
  aiCount: number;
  groundedCount: number;
} {
  let humanCount = 0;
  let aiCount = 0;
  let groundedCount = 0;

  for (const source of sources) {
    if (source.source === "human") humanCount++;
    else if (source.source === "ai_assumption") aiCount++;
    else groundedCount++;
  }

  return { humanCount, aiCount, groundedCount };
}

type PlannedSubstate = {
  id: string;
  stateId: string;
  qualifiedKey: string;
  input: SubstateInput;
  label: string;
  order: number;
};

type PlannedState = { id: string; input: StateInput; order: number };

type Plan = {
  states: PlannedState[];
  substates: PlannedSubstate[];
  stateEdges: { fromId: string; toId: string }[];
  substateEdges: { fromId: string; toId: string }[];
};

/**
 * Turns the payload into rows, assigning ids up front so edges can be wired
 * without a round-trip per node. Pure, so the shaping is unit-testable without
 * a database.
 */
export function planGraph(input: PublishGraphInput): Plan {
  const states: PlannedState[] = [];
  const substates: PlannedSubstate[] = [];
  const stateIdByKey = new Map<string, string>();
  const substateIdByQualifiedKey = new Map<string, string>();

  // Circle captions run S1, S2, S3... across the whole spec rather than
  // restarting inside each container, matching how the diagram is read.
  let caption = 0;

  input.states.forEach((stateInput, stateOrder) => {
    if (stateIdByKey.has(stateInput.key)) {
      throw new GraphPublishError(`Duplicate state key '${stateInput.key}'.`);
    }
    const stateId = randomUUID();
    stateIdByKey.set(stateInput.key, stateId);
    states.push({ id: stateId, input: stateInput, order: stateOrder });

    stateInput.substates.forEach((substateInput, substateOrder) => {
      const qualifiedKey = `${stateInput.key}/${substateInput.key}`;
      if (substateIdByQualifiedKey.has(qualifiedKey)) {
        throw new GraphPublishError(`Duplicate substate key '${qualifiedKey}'.`);
      }
      const substateId = randomUUID();
      substateIdByQualifiedKey.set(qualifiedKey, substateId);
      caption += 1;
      substates.push({
        id: substateId,
        stateId,
        qualifiedKey,
        input: substateInput,
        label: `S${caption}`,
        order: substateOrder,
      });
    });
  });

  const stateEdges = input.stateEdges
    ? input.stateEdges.map((edge) => ({
        fromId: resolveState(stateIdByKey, edge.from),
        toId: resolveState(stateIdByKey, edge.to),
      }))
    : // No edges supplied: chain the containers in payload order, which is the
      // linear case every SDD plan produces today.
      states.slice(1).map((state, i) => ({ fromId: states[i].id, toId: state.id }));

  const substateEdges = input.substateEdges
    ? input.substateEdges.map((edge) => ({
        fromId: resolveSubstate(substateIdByQualifiedKey, edge.from),
        toId: resolveSubstate(substateIdByQualifiedKey, edge.to),
      }))
    : // Chain within each container only - never across containers, which is
      // what the state-level edges are for.
      states.flatMap((state) => {
        const own = substates.filter((s) => s.stateId === state.id);
        return own.slice(1).map((s, i) => ({ fromId: own[i].id, toId: s.id }));
      });

  return { states, substates, stateEdges, substateEdges: dedupe(substateEdges) };
}

function dedupe(edges: { fromId: string; toId: string }[]): { fromId: string; toId: string }[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.fromId}->${edge.toId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveState(map: Map<string, string>, key: string): string {
  const id = map.get(key);
  if (!id) throw new GraphPublishError(`stateEdges references unknown state '${key}'.`);
  return id;
}

function resolveSubstate(map: Map<string, string>, key: string): string {
  const id = map.get(key);
  if (!id) {
    throw new GraphPublishError(
      `substateEdges references unknown substate '${key}' (expected "<stateKey>/<substateKey>").`
    );
  }
  return id;
}

/** Builds "($1,$2),($3,$4)" for a multi-row insert of `width` columns. */
function placeholders(rowCount: number, width: number): string {
  const rows: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const cols: string[] = [];
    for (let c = 0; c < width; c++) cols.push(`$${r * width + c + 1}`);
    rows.push(`(${cols.join(",")})`);
  }
  return rows.join(",");
}

export function createGraphStore(pool: PoolLike): GraphStore {
  return {
    async publishGraph(userId, input) {
      assertConsent(input);
      const plan = planGraph(input);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const { slug, name, originHash } = input.consent.project;

        // Refuse to merge two different repos that happen to share a slug -
        // silently folding them together would produce a graph that describes
        // no real project.
        const existing = await client.query(
          `SELECT id, "consentScope" FROM "Project" WHERE "userId" = $1 AND slug = $2`,
          [userId, slug]
        );
        const priorOrigin = existing.rows[0]?.consentScope?.originHash;
        if (priorOrigin && priorOrigin !== originHash) {
          throw new GraphPublishError(
            `Project slug '${slug}' is already used by a different repository. ` +
              `Pick a different slug in .governed-superpowers/sharing.json.`
          );
        }

        const projectRes = await client.query(
          `INSERT INTO "Project" ("id","userId",slug,name,"consentScope","consentGrantedAt","consentRecordedAt","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW(),NOW())
           ON CONFLICT ("userId",slug) DO UPDATE
             SET name = EXCLUDED.name,
                 "consentScope" = EXCLUDED."consentScope",
                 "consentGrantedAt" = EXCLUDED."consentGrantedAt",
                 "consentRecordedAt" = NOW(),
                 "updatedAt" = NOW()
           RETURNING id`,
          [
            randomUUID(),
            userId,
            slug,
            name,
            JSON.stringify({ ...input.consent.scope, originHash, grantedBy: input.consent.grantedBy }),
            new Date(input.consent.grantedAt),
          ]
        );
        const projectId: string = projectRes.rows[0].id;

        // The DO UPDATE set deliberately omits title and "order". Once a sheet
        // tab exists the user owns its name and position; a re-publish that
        // overwrote them would silently undo a rename every time the agent
        // finished a task.
        const specRes = await client.query(
          `INSERT INTO "GraphSpec" ("id","projectId","specPath",title,"order","planPath","lastPublishedAt","createdAt","updatedAt")
           VALUES ($1,$2,$3,$4,
                   COALESCE((SELECT MAX("order") + 1 FROM "GraphSpec" WHERE "projectId" = $2), 0),
                   $5,NOW(),NOW(),NOW())
           ON CONFLICT ("projectId","specPath") DO UPDATE
             SET "planPath" = EXCLUDED."planPath",
                 "lastPublishedAt" = NOW(),
                 "updatedAt" = NOW()
           RETURNING id, title, (xmax = 0) AS inserted`,
          [randomUUID(), projectId, input.spec.path, input.spec.title, input.spec.planPath ?? null]
        );
        const specId: string = specRes.rows[0].id;
        const specTitle: string = specRes.rows[0].title;
        const created: boolean = specRes.rows[0].inserted === true;

        // Full replace below the spec row. Cascades take out substates,
        // sources and both edge tables; the edge tables are keyed on specId
        // too, so clear them explicitly for the payload-supplied case.
        await client.query(`DELETE FROM "GraphState" WHERE "specId" = $1`, [specId]);
        await client.query(`DELETE FROM "GraphStateEdge" WHERE "specId" = $1`, [specId]);
        await client.query(`DELETE FROM "GraphSubstateEdge" WHERE "specId" = $1`, [specId]);

        if (plan.states.length > 0) {
          const values = plan.states.flatMap((s) => [
            s.id,
            specId,
            s.input.key,
            s.input.label,
            s.input.summary ?? null,
            s.order,
          ]);
          await client.query(
            `INSERT INTO "GraphState" ("id","specId",key,label,summary,"order","createdAt")
             SELECT v.id::uuid, v."specId"::uuid, v.key, v.label, v.summary, v."order"::int, NOW()
               FROM (VALUES ${placeholders(plan.states.length, 6)})
                 AS v(id,"specId",key,label,summary,"order")`,
            values
          );
        }

        let sourceCount = 0;
        if (plan.substates.length > 0) {
          const values = plan.substates.flatMap((s) => {
            const counts = countSources(s.input.sources);
            sourceCount += s.input.sources?.length ?? 0;
            return [
              s.id,
              s.stateId,
              s.input.key,
              s.label,
              s.input.title,
              s.order,
              s.input.status ?? null,
              s.input.changes ? JSON.stringify(s.input.changes) : null,
              s.input.commits ?? [],
              s.input.notes ?? null,
              counts.humanCount,
              counts.aiCount,
              counts.groundedCount,
            ];
          });
          await client.query(
            `INSERT INTO "GraphSubstate"
               ("id","stateId",key,label,title,"order",status,changes,commits,notes,
                "humanCount","aiCount","groundedCount","createdAt")
             SELECT v.id::uuid, v."stateId"::uuid, v.key, v.label, v.title, v."order"::int,
                    v.status::"SubstateStatus", v.changes::jsonb, v.commits::text[], v.notes,
                    v."humanCount"::int, v."aiCount"::int, v."groundedCount"::int, NOW()
               FROM (VALUES ${placeholders(plan.substates.length, 13)})
                 AS v(id,"stateId",key,label,title,"order",status,changes,commits,notes,
                      "humanCount","aiCount","groundedCount")`,
            values
          );
        }

        const sourceRows = plan.substates.flatMap((s) =>
          (s.input.sources ?? []).map((source) => [
            randomUUID(),
            s.id,
            source.marker ?? null,
            source.source,
            source.ref ?? null,
            source.text ?? null,
          ])
        );
        if (sourceRows.length > 0) {
          await client.query(
            `INSERT INTO "GraphSource" ("id","substateId",marker,source,ref,text)
             SELECT v.id::uuid, v."substateId"::uuid, v.marker, v.source::"ProvenanceSource", v.ref, v.text
               FROM (VALUES ${placeholders(sourceRows.length, 6)})
                 AS v(id,"substateId",marker,source,ref,text)`,
            sourceRows.flat()
          );
        }

        await insertEdges(client, `"GraphStateEdge"`, specId, plan.stateEdges);
        await insertEdges(client, `"GraphSubstateEdge"`, specId, plan.substateEdges);

        await client.query("COMMIT");

        return {
          projectSlug: slug,
          specPath: input.spec.path,
          specTitle,
          created,
          states: plan.states.length,
          substates: plan.substates.length,
          sources: sourceCount,
          stateEdges: plan.stateEdges.length,
          substateEdges: plan.substateEdges.length,
          annotationCoverage: input.annotationCoverage,
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },

    async listGraphs(userId) {
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          `SELECT p.slug,
                  p.name,
                  p."consentGrantedAt",
                  p."consentScope",
                  s."specPath",
                  s.title,
                  s."lastPublishedAt",
                  (SELECT COUNT(*) FROM "GraphState" st WHERE st."specId" = s.id) AS states,
                  (SELECT COUNT(*) FROM "GraphSubstate" sub
                     JOIN "GraphState" st2 ON st2.id = sub."stateId"
                    WHERE st2."specId" = s.id) AS substates,
                  (SELECT COUNT(*) FROM "GraphSource" src
                     JOIN "GraphSubstate" sub2 ON sub2.id = src."substateId"
                     JOIN "GraphState" st3 ON st3.id = sub2."stateId"
                    WHERE st3."specId" = s.id) AS sources
             FROM "Project" p
             LEFT JOIN "GraphSpec" s ON s."projectId" = p.id
            WHERE p."userId" = $1
            ORDER BY p.slug, s."order"`,
          [userId]
        );

        const bySlug = new Map<string, ProjectSummary>();
        for (const row of rows) {
          let project = bySlug.get(row.slug);
          if (!project) {
            const { originHash: _o, grantedBy: _g, ...scope } = row.consentScope ?? {};
            project = {
              slug: row.slug,
              name: row.name,
              consentGrantedAt: row.consentGrantedAt,
              scope: scope as ConsentScope,
              specs: [],
            };
            bySlug.set(row.slug, project);
          }
          if (row.specPath) {
            project.specs.push({
              specPath: row.specPath,
              title: row.title,
              states: Number(row.states),
              substates: Number(row.substates),
              sources: Number(row.sources),
              lastPublishedAt: row.lastPublishedAt,
            });
          }
        }
        return [...bySlug.values()];
      } finally {
        client.release();
      }
    },

    async revokeGraph(userId, input) {
      const client = await pool.connect();
      try {
        const projectRes = await client.query(
          `SELECT id FROM "Project" WHERE "userId" = $1 AND slug = $2`,
          [userId, input.projectSlug]
        );
        const project = projectRes.rows[0];
        if (!project) return { removedSpecs: 0, removedProject: false };

        if (input.all) {
          const specs = await client.query(`DELETE FROM "GraphSpec" WHERE "projectId" = $1 RETURNING id`, [
            project.id,
          ]);
          await client.query(`DELETE FROM "Project" WHERE id = $1`, [project.id]);
          return { removedSpecs: specs.rows.length, removedProject: true };
        }

        const specs = await client.query(
          `DELETE FROM "GraphSpec" WHERE "projectId" = $1 AND "specPath" = $2 RETURNING id`,
          [project.id, input.specPath]
        );
        return { removedSpecs: specs.rows.length, removedProject: false };
      } finally {
        client.release();
      }
    },
  };
}

async function insertEdges(
  client: ClientLike,
  table: string,
  specId: string,
  edges: { fromId: string; toId: string }[]
): Promise<void> {
  if (edges.length === 0) return;

  const values = edges.flatMap((edge) => [randomUUID(), specId, edge.fromId, edge.toId]);
  await client.query(
    `INSERT INTO ${table} ("id","specId","fromId","toId")
     SELECT v.id::uuid, v."specId"::uuid, v."fromId"::uuid, v."toId"::uuid
       FROM (VALUES ${placeholders(edges.length, 4)}) AS v(id,"specId","fromId","toId")
     ON CONFLICT ("fromId","toId") DO NOTHING`,
    values
  );
}
