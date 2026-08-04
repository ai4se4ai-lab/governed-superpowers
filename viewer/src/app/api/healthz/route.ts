export const dynamic = "force-dynamic";

/**
 * Container healthcheck placeholder. This only proves Next.js booted - it
 * does not check whether GRAPH_DIR is mounted or reachable, because
 * GRAPH_DIR does not exist as a concept yet (Task 10 introduces it). Once it
 * does, this route should check it and return 503 when it's missing or
 * unreadable, mirroring web/src/app/api/healthz/route.ts's database check.
 */
export function GET() {
  return Response.json({ ok: true });
}
