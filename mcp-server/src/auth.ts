import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf-8").digest();
}

/**
 * Constant-time comparison of two secrets of possibly-different length.
 * Hashing first fixes both buffers at 32 bytes so timingSafeEqual (which
 * throws on length mismatch) never sees the raw token lengths.
 */
function secretsMatch(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Express middleware requiring `Authorization: Bearer <token>` to match
 * `expectedToken`. Every /mcp request must be authenticated - this server
 * is meant to be reachable from the public internet.
 */
export function requireBearerToken(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const header = req.header("authorization") ?? "";
    const [scheme, token] = header.split(" ");

    if (scheme?.toLowerCase() !== "bearer" || !token || !secretsMatch(token, expectedToken)) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized: missing or invalid bearer token" },
        id: null,
      });
      return;
    }

    next();
  };
}
