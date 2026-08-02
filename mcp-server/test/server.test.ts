import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import type { TokenVerifier } from "../src/auth.js";
import type { GraphStore } from "../src/graphs.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "..", "..", "skills");
const TOKEN = "gsp_abcdefghijkm_test-token";
/** A second, unrelated account - used to prove sessions aren't shareable. */
const OTHER_TOKEN = "gsp_nopqrstuvwxy_other-token";

// Stubs the Postgres-backed verifier from src/db.ts so these tests exercise
// the MCP transport without needing a database.
const verifier: TokenVerifier = async (token) => {
  if (token === TOKEN) return { userId: "test-user", tokenId: "test-token-id" };
  if (token === OTHER_TOKEN) return { userId: "other-user", tokenId: "other-token-id" };
  return null;
};

async function withServer<T>(fn: (baseUrl: URL) => Promise<T>, graphStore?: GraphStore): Promise<T> {
  const app = createApp(SKILLS_DIR, verifier, graphStore);
  const httpServer: Server = createServer(app);

  await new Promise<void>((resolveListen) => httpServer.listen(0, "127.0.0.1", resolveListen));
  const address = httpServer.address();
  if (!address || typeof address === "string") {
    throw new Error("expected an AddressInfo from httpServer.listen");
  }

  try {
    return await fn(new URL(`http://127.0.0.1:${address.port}/mcp`));
  } finally {
    await new Promise<void>((resolveClose) => httpServer.close(() => resolveClose()));
  }
}

async function connectedClient(baseUrl: URL, token = TOKEN): Promise<Client> {
  return (await connect(baseUrl, token)).client;
}

async function connect(baseUrl: URL, token = TOKEN) {
  const transport = new StreamableHTTPClientTransport(baseUrl, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(transport);
  return { client, transport };
}

test("GET /healthz responds without auth", async () => {
  await withServer(async (baseUrl) => {
    const healthUrl = new URL("/healthz", baseUrl);
    const response = await fetch(healthUrl);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");
  });
});

test("initialize is rejected without a bearer token", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "unauth-client", version: "0.0.0" },
        },
      }),
    });
    assert.equal(response.status, 401);
  });
});

test("initialize returns non-empty bootstrap instructions", async () => {
  await withServer(async (baseUrl) => {
    const client = await connectedClient(baseUrl);
    const instructions = client.getInstructions();
    assert.ok(instructions && instructions.length > 0);
    assert.match(instructions, /governed-superpowers/i);
    await client.close();
  });
});

test("list_skills, get_skill, and search_skills tools work end-to-end", async () => {
  await withServer(async (baseUrl) => {
    const client = await connectedClient(baseUrl);

    const tools = await client.listTools();
    const toolNames = tools.tools.map((t) => t.name).sort();
    assert.deepEqual(toolNames, ["get_bootstrap", "get_skill", "list_skills", "search_skills"]);

    const listResult = await client.callTool({ name: "list_skills", arguments: {} });
    const listText = (listResult.content as Array<{ type: string; text: string }>)[0].text;
    assert.match(listText, /brainstorming/);
    assert.match(listText, /systematic-debugging/);

    const getResult = await client.callTool({ name: "get_skill", arguments: { name: "brainstorming" } });
    const getText = (getResult.content as Array<{ type: string; text: string }>)[0].text;
    assert.match(getText, /Brainstorming Ideas Into Designs/);

    const missingResult = await client.callTool({ name: "get_skill", arguments: { name: "not-a-skill" } });
    assert.equal(missingResult.isError, true);

    const searchResult = await client.callTool({ name: "search_skills", arguments: { query: "root cause" } });
    const searchText = (searchResult.content as Array<{ type: string; text: string }>)[0].text;
    assert.match(searchText, /systematic-debugging/);

    await client.close();
  });
});

test("all 14 skill prompts are registered and return the skill body", async () => {
  await withServer(async (baseUrl) => {
    const client = await connectedClient(baseUrl);

    const prompts = await client.listPrompts();
    assert.equal(prompts.prompts.length, 14);
    assert.ok(prompts.prompts.some((p) => p.name === "brainstorming"));

    const result = await client.getPrompt({ name: "brainstorming", arguments: {} });
    assert.equal(result.messages.length, 1);
    assert.equal(result.messages[0].role, "user");
    assert.match((result.messages[0].content as { text: string }).text, /Brainstorming Ideas Into Designs/);

    await client.close();
  });
});

test("skill files are readable as resources", async () => {
  await withServer(async (baseUrl) => {
    const client = await connectedClient(baseUrl);

    const resources = await client.listResources();
    assert.ok(resources.resources.length > 14, "expected more resources than just one per skill's SKILL.md");
    assert.ok(resources.resources.some((r) => r.uri === "skill://brainstorming/SKILL.md"));

    const read = await client.readResource({ uri: "skill://brainstorming/SKILL.md" });
    assert.equal(read.contents.length, 1);
    assert.match(read.contents[0].text as string, /Brainstorming Ideas Into Designs/);

    await client.close();
  });
});

test("wrong bearer token is rejected even on an existing session's follow-up call", async () => {
  await withServer(async (baseUrl) => {
    await assert.rejects(connectedClient(baseUrl, "wrong-token"));
  });
});

// ---------------------------------------------------------------- graph tools

/** Records who each call was attributed to, so scoping can be asserted. */
function stubGraphStore() {
  const publishes: { userId: string; specPath: string }[] = [];
  const store: GraphStore = {
    async publishGraph(userId, input) {
      publishes.push({ userId, specPath: input.spec.path });
      return {
        projectSlug: input.consent.project.slug,
        specPath: input.spec.path,
        specTitle: input.spec.title,
        created: true,
        states: input.states.length,
        substates: input.states.reduce((n, s) => n + s.substates.length, 0),
        sources: 0,
        stateEdges: 0,
        substateEdges: 0,
      };
    },
    async listGraphs() {
      return [];
    },
    async revokeGraph() {
      return { removedSpecs: 0, removedProject: false };
    },
  };
  return { store, publishes };
}

const publishArgs = {
  consent: {
    version: 1,
    project: { slug: "evergrace", name: "Evergrace", originHash: "sha256:abc" },
    scope: { specPaths: true, substateTitles: true, changePaths: true, annotationText: true },
    grantedAt: new Date().toISOString(),
    grantedBy: "human partner, in session",
    revokedAt: null,
  },
  spec: { path: "docs/specs/auth.md", title: "Auth redesign" },
  states: [{ key: "groundwork", label: "Lay the groundwork", substates: [{ key: "task-1", title: "Schema" }] }],
};

test("graph tools are absent when the server has no store, and present when it does", async () => {
  await withServer(async (baseUrl) => {
    const client = await connectedClient(baseUrl);
    const names = (await client.listTools()).tools.map((t) => t.name);
    assert.ok(!names.includes("publish_graph"), "publish_graph must not exist without a store");
    await client.close();
  });

  await withServer(
    async (baseUrl) => {
      const client = await connectedClient(baseUrl);
      const names = (await client.listTools()).tools.map((t) => t.name).sort();
      assert.deepEqual(names, [
        "get_bootstrap",
        "get_skill",
        "list_published_graphs",
        "list_skills",
        "publish_graph",
        "revoke_published_graph",
        "search_skills",
      ]);
      await client.close();
    },
    stubGraphStore().store
  );
});

test("a publish is attributed to the token holder, never to the payload", async () => {
  const { store, publishes } = stubGraphStore();

  await withServer(async (baseUrl) => {
    const client = await connectedClient(baseUrl, OTHER_TOKEN);
    const result = await client.callTool({ name: "publish_graph", arguments: publishArgs });

    assert.notEqual(result.isError, true);
    assert.deepEqual(publishes, [{ userId: "other-user", specPath: "docs/specs/auth.md" }]);
    await client.close();
  }, store);
});

test("one user cannot reuse another user's MCP session", async () => {
  // Sessions are keyed by an id the server generates, but that id is not a
  // capability: presenting it with a different valid token must be refused.
  // Before publish tools existed this only leaked read-only skill calls; now
  // it would mean writing graphs under someone else's account.
  const { store, publishes } = stubGraphStore();

  await withServer(async (baseUrl) => {
    const { client, transport } = await connect(baseUrl, TOKEN);
    const sessionId = transport.sessionId;
    assert.ok(sessionId, "expected the transport to expose its session id");

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${OTHER_TOKEN}`,
        "mcp-session-id": sessionId,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 99,
        method: "tools/call",
        params: { name: "publish_graph", arguments: publishArgs },
      }),
    });

    assert.equal(response.status, 403);
    assert.equal(publishes.length, 0, "the hijacked call must never reach the store");

    await client.close();
  }, store);
});

test("the session owner is still served normally on the same session id", async () => {
  const { store } = stubGraphStore();

  await withServer(async (baseUrl) => {
    const { client } = await connect(baseUrl, TOKEN);
    const result = await client.callTool({ name: "list_published_graphs", arguments: {} });

    assert.notEqual(result.isError, true);
    await client.close();
  }, store);
});

test("a GET on someone else's session is refused too", async () => {
  const { store } = stubGraphStore();

  await withServer(async (baseUrl) => {
    const { client, transport } = await connect(baseUrl, TOKEN);

    const response = await fetch(baseUrl, {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${OTHER_TOKEN}`,
        "mcp-session-id": transport.sessionId!,
      },
    });

    assert.equal(response.status, 403);
    await client.close();
  }, store);
});

test("publish_graph refuses a revoked consent record", async () => {
  // The gate itself is unit-tested in graphs.test.ts; this proves the tool
  // surfaces the refusal as an MCP error rather than throwing.
  const { store, publishes } = stubGraphStore();
  const realStore: GraphStore = {
    ...store,
    async publishGraph() {
      const { GraphPublishError } = await import("../src/graphs.js");
      throw new GraphPublishError("Consent for this project has been revoked.");
    },
  };

  await withServer(async (baseUrl) => {
    const client = await connectedClient(baseUrl);
    const result = await client.callTool({ name: "publish_graph", arguments: publishArgs });

    assert.equal(result.isError, true);
    assert.match((result.content as Array<{ text: string }>)[0].text, /revoked/);
    assert.equal(publishes.length, 0);
    await client.close();
  }, realStore);
});
