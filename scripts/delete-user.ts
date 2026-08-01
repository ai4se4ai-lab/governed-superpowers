// Permanently deletes a user and every record that references them
// (Session, VerificationToken, McpToken all have onDelete: Cascade in
// web/prisma/schema.prisma, so one User delete removes all of it in
// Postgres).
//
// Usage (run from the repo root):
//   npx tsx scripts/delete-user.ts --db local  --email someone@example.com
//   npx tsx scripts/delete-user.ts --db cloud  --username someone
//   npx tsx scripts/delete-user.ts --db local  --id 123e4567-e89b-12d3-a456-426614174000
//
//   --db local (default) -> reads DATABASE_URL from the repo-root .env and
//                            rewrites its host from "db" (the compose service
//                            name) to "localhost", matching the port that
//                            docker-compose.dev.yml publishes to the host.
//                            Requires `./scripts/docker-up.sh --db local` (or
//                            equivalent) already running.
//   --db cloud             -> reads DATABASE_URL (Supabase pooled connection)
//                            from the repo-root .env and uses it as-is, same
//                            as scripts/docker-up.sh --db cloud.
//
//   --yes / -y  -> skip the interactive confirmation prompt (for scripted
//                  use - double-check the identifier before doing this).
//
// This lives at the repo root (not web/) but depends on web's Prisma client
// and its normalizeEmail() helper - it loads them via createRequire(web/)
// below so it always resolves web/node_modules regardless of cwd, rather
// than duplicating a node_modules tree at the repo root.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createInterface } from "node:readline/promises";

const repoRoot = path.resolve(__dirname, "..");
const webRequire = createRequire(path.join(repoRoot, "web", "package.json"));

function parseArgs(argv: string[]) {
  let email: string | undefined;
  let username: string | undefined;
  let id: string | undefined;
  let dbChoice: "local" | "cloud" = "local";
  let yes = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--email") email = argv[++i];
    else if (arg === "--username") username = argv[++i];
    else if (arg === "--id") id = argv[++i];
    else if (arg === "--yes" || arg === "-y") yes = true;
    else if (arg === "--db") {
      const val = argv[++i];
      if (val !== "local" && val !== "cloud") {
        console.error(`ERROR: --db must be 'local' or 'cloud', got '${val}'.`);
        process.exit(1);
      }
      dbChoice = val;
    } else {
      console.error(`Unrecognized argument: ${arg}`);
      process.exit(1);
    }
  }

  const identifiers = [email, username, id].filter((v) => v !== undefined);
  if (identifiers.length !== 1) {
    console.error(
      "Provide exactly one of --email, --username, or --id (plus optional --db local|cloud and --yes).",
    );
    process.exit(1);
  }

  return { email, username, id, dbChoice, yes };
}

// Mirrors the .env parsing in scripts/docker-up.sh: reads the file fresh
// rather than relying on already-exported shell variables.
function parseEnvFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!existsSync(filePath)) return result;

  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    result[key] = val;
  }
  return result;
}

function resolveDatabaseUrl(dbChoice: "local" | "cloud"): string {
  const env = { ...parseEnvFile(path.join(repoRoot, ".env")), ...process.env };

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL is not set in the repo-root .env.");
    process.exit(1);
  }

  if (dbChoice === "cloud") {
    if (!env.SUPABASE_DB_URL) {
      console.error(
        "ERROR: --db cloud requires SUPABASE_DB_URL (Supabase direct connection) set in .env, same as docker-up.sh --db cloud.",
      );
      process.exit(1);
    }
    // The pooled connection (DATABASE_URL) is fine for a single delete - no
    // migration engine involved, so pgbouncer's transaction-mode pooling
    // isn't a problem here.
    return databaseUrl;
  }

  // Local: DATABASE_URL points at the "db" compose service name, which only
  // resolves inside the compose network. docker-compose.dev.yml publishes
  // that same Postgres on localhost:5432, so swap the host for the script to
  // reach it from the host machine.
  const url = new URL(databaseUrl);
  url.hostname = "localhost";
  return url.toString();
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
}

async function main() {
  const { email, username, id, dbChoice, yes } = parseArgs(process.argv.slice(2));

  process.env.DATABASE_URL = resolveDatabaseUrl(dbChoice);
  console.log(`DB_PROVIDER = ${dbChoice === "local" ? "postgres (--db local)" : "supabase (--db cloud)"}`);

  // Loaded after DATABASE_URL is finalized above, since PrismaClient reads
  // it at construction time. Resolved against web/ via webRequire so this
  // works regardless of where the script is invoked from.
  const { PrismaClient } = webRequire("@prisma/client");
  const { normalizeEmail } = webRequire("./src/lib/validation");
  const prisma = new PrismaClient();

  try {
    const user = email
      ? await prisma.user.findUnique({ where: { email: normalizeEmail(email) } })
      : username
        ? await prisma.user.findUnique({ where: { username } })
        : await prisma.user.findUnique({ where: { id } });

    if (!user) {
      console.error("No user found matching that identifier.");
      process.exitCode = 1;
      return;
    }

    const [sessionCount, verificationCount, mcpTokenCount] = await Promise.all([
      prisma.session.count({ where: { userId: user.id } }),
      prisma.verificationToken.count({ where: { userId: user.id } }),
      prisma.mcpToken.count({ where: { userId: user.id } }),
    ]);

    console.log(`User: ${user.username} <${user.email}> (id: ${user.id})`);
    console.log(
      `Will also delete: ${sessionCount} session(s), ${verificationCount} verification token(s), ${mcpTokenCount} MCP token(s).`,
    );

    if (!yes) {
      const ok = await confirm(`Type "yes" to permanently delete this user and all related records: `);
      if (!ok) {
        console.log("Aborted.");
        return;
      }
    }

    // The FK cascades (onDelete: Cascade) handle Session, VerificationToken,
    // and McpToken - no need to delete them explicitly.
    await prisma.user.delete({ where: { id: user.id } });

    console.log(`Deleted user ${user.username} <${user.email}> and all related records.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
