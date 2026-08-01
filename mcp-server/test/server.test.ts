import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createApp } from "../src/app.js";
import type { TokenVerifier } from "../src/auth.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "..", "..", "skills");
const TOKEN = "gsp_abcdefghijkm_test-token";

// Stubs the Postgres-backed verifier from src/db.ts so these tests exercise
// the MCP transport without needing a database.
const verifier: TokenVerifier = async (token) =>
  token === TOKEN ? { userId: "test-user", tokenId: "test-token-id" } : null;

async function withServer<T>(fn: (baseUrl: URL) => Promise<T>): Promise<T> {
  const app = createApp(SKILLS_DIR, verifier);
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
  const transport = new StreamableHTTPClientTransport(baseUrl, {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(transport);
  return client;
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
