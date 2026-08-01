import type { NextFunction, Request, Response } from "express";

/** The identity behind an accepted token, attached to the request. */
export type VerifiedToken = { userId: string; tokenId: string };

/**
 * Resolves a presented bearer token to an identity, or null if it is unknown,
 * revoked or expired. The database-backed implementation lives in db.ts; tests
 * substitute their own so the middleware can be exercised without Postgres.
 */
export type TokenVerifier = (token: string) => Promise<VerifiedToken | null>;

export interface AuthedRequest extends Request {
  auth?: VerifiedToken;
}

function unauthorized(res: Response): void {
  res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: "Unauthorized: missing or invalid bearer token" },
    id: null,
  });
}

/**
 * Express middleware requiring `Authorization: Bearer <token>` where the token
 * is one issued by the account portal. Every /mcp request must be
 * authenticated - this server is meant to be reachable from the public
 * internet.
 *
 * Tokens are per-user and revocable, so a revocation in the portal takes
 * effect on the very next request that presents it.
 */
export function requireMcpToken(verify: TokenVerifier) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token) {
      unauthorized(res);
      return;
    }

    let verified: VerifiedToken | null;
    try {
      verified = await verify(token);
    } catch (error) {
      // A database outage must not be reported as "your token is fine but the
      // server broke" - but it also must not look like a valid rejection to
      // an operator reading logs.
      console.error("Token verification failed", error);
      res.status(503).json({
        jsonrpc: "2.0",
        error: { code: -32002, message: "Service unavailable: cannot verify credentials" },
        id: null,
      });
      return;
    }

    if (!verified) {
      unauthorized(res);
      return;
    }

    (req as AuthedRequest).auth = verified;
    next();
  };
}
