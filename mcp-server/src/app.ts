import { randomUUID } from "node:crypto";
import express, { type Request, type Response, type Express } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { requireMcpToken, type AuthedRequest, type TokenVerifier } from "./auth.js";
import type { GraphStore } from "./graphs.js";

/**
 * Builds the Express app (routes + auth + session-routed MCP transport)
 * without binding a port, so it can be exercised directly in tests via
 * an in-process HTTP server, and reused unchanged by the CLI entrypoint.
 *
 * `verify` resolves a bearer token to a user; index.ts supplies the
 * Postgres-backed implementation, tests supply a stub. `graphStore` is
 * optional - without it the collaboration-graph tools aren't registered.
 */
export function createApp(skillsDir: string, verify: TokenVerifier, graphStore?: GraphStore): Express {
  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", name: SERVER_NAME, version: SERVER_VERSION });
  });

  /**
   * Sessions are keyed by the id the transport generates, but each one is also
   * bound to the user whose token opened it. Both are needed: the session id
   * alone is a bearer capability that any authenticated caller could present,
   * which - now that tools can write - would mean writing under someone else's
   * account.
   */
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; userId: string }>();

  /** The session, or null if it doesn't exist or belongs to someone else. */
  function sessionFor(req: Request, sessionId: string): StreamableHTTPServerTransport | null {
    const session = sessions.get(sessionId);
    if (!session) return null;
    if (session.userId !== (req as AuthedRequest).auth?.userId) return null;
    return session.transport;
  }

  function forbidden(res: Response): void {
    res.status(403).json({
      jsonrpc: "2.0",
      error: { code: -32003, message: "Forbidden: session belongs to a different user" },
      id: null,
    });
  }

  async function handleMcpPost(req: Request, res: Response): Promise<void> {
    const sessionId = req.header("mcp-session-id");
    let transport: StreamableHTTPServerTransport;

    if (sessionId && sessions.has(sessionId)) {
      const owned = sessionFor(req, sessionId);
      if (!owned) {
        forbidden(res);
        return;
      }
      transport = owned;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // requireMcpToken has already run, so auth is always present here.
      const userId = (req as AuthedRequest).auth!.userId;

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (initializedId) => {
          sessions.set(initializedId, { transport, userId });
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };

      const server = buildServer(skillsDir, { userId, graphStore });
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid session ID provided" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  }

  async function handleMcpSessionRequest(req: Request, res: Response): Promise<void> {
    const sessionId = req.header("mcp-session-id");
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: null,
      });
      return;
    }

    const transport = sessionFor(req, sessionId);
    if (!transport) {
      forbidden(res);
      return;
    }
    await transport.handleRequest(req, res);
  }

  const auth = requireMcpToken(verify);

  app.post("/mcp", auth, handleMcpPost);
  app.get("/mcp", auth, handleMcpSessionRequest);
  app.delete("/mcp", auth, handleMcpSessionRequest);

  return app;
}
