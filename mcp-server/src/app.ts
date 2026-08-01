import { randomUUID } from "node:crypto";
import express, { type Request, type Response, type Express } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { requireBearerToken } from "./auth.js";

/**
 * Builds the Express app (routes + auth + session-routed MCP transport)
 * without binding a port, so it can be exercised directly in tests via
 * an in-process HTTP server, and reused unchanged by the CLI entrypoint.
 */
export function createApp(skillsDir: string, token: string): Express {
  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", name: SERVER_NAME, version: SERVER_VERSION });
  });

  const transports = new Map<string, StreamableHTTPServerTransport>();

  async function handleMcpPost(req: Request, res: Response): Promise<void> {
    const sessionId = req.header("mcp-session-id");
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else if (!sessionId && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (initializedId) => {
          transports.set(initializedId, transport);
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
      };

      const server = buildServer(skillsDir);
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
    if (!sessionId || !transports.has(sessionId)) {
      res.status(404).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Session not found" },
        id: null,
      });
      return;
    }
    await transports.get(sessionId)!.handleRequest(req, res);
  }

  const auth = requireBearerToken(token);

  app.post("/mcp", auth, handleMcpPost);
  app.get("/mcp", auth, handleMcpSessionRequest);
  app.delete("/mcp", auth, handleMcpSessionRequest);

  return app;
}
