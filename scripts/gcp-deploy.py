#!/usr/bin/env python3
"""
Deploy the governed-superpowers self-hosted stack (web + mcp-server) to
Google Cloud Run.

Usage:
    python scripts/gcp-deploy.py

Config comes from .env (repo root) plus real environment variables (which take
precedence - useful in CI). Required:

    GCP_PROJECT_ID

Optional, with defaults:

    GCP_REGION            default: us-central1
    GCP_ARTIFACT_REPO      default: gcr.io
    GCP_WEB_SERVICE_NAME   default: governed-superpowers-web
    GCP_MCP_SERVICE_NAME   default: governed-superpowers-mcp

If SUPABASE_DB_URL is set, pending Prisma migrations are applied against it
before deploying.

Requirements: gcloud CLI, Docker.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

REQUIRED_ENV_KEYS = ["GCP_PROJECT_ID"]
DEFAULTS = {
    "GCP_REGION": "us-central1",
    "GCP_ARTIFACT_REPO": "gcr.io",
    "GCP_WEB_SERVICE_NAME": "governed-superpowers-web",
    "GCP_MCP_SERVICE_NAME": "governed-superpowers-mcp",
}

# SMTP_* and MAIL_FROM/APP_URL are forwarded to the `web` Cloud Run service
# from .env, mirroring the env list docker-compose.yml already gives it.
WEB_ENV_PASSTHROUGH_KEYS = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_SECURE",
    "MAIL_FROM",
]

LEGACY_GCR_HOSTS = {"gcr.io", "us.gcr.io", "eu.gcr.io", "asia.gcr.io"}


@dataclass(frozen=True)
class GcpConfig:
    project_id: str
    region: str
    artifact_repo: str
    web_service_name: str
    mcp_service_name: str

    def image_path(self, service_name: str) -> str:
        if self.artifact_repo in LEGACY_GCR_HOSTS:
            return f"{self.artifact_repo}/{self.project_id}/{service_name}"
        return f"{self.region}-docker.pkg.dev/{self.project_id}/{self.artifact_repo}/{service_name}"


def read_dotenv(path: Path) -> dict[str, str]:
    """Parse a .env file into a dict. Missing file returns {}."""
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


def load_config(env: dict[str, str]) -> GcpConfig:
    """Resolve GcpConfig from a merged env dict (real env vars should already
    take precedence over .env values by the time this is called - see
    resolve_env()). Exits with an error message if GCP_PROJECT_ID is missing.
    """
    missing = [key for key in REQUIRED_ENV_KEYS if not env.get(key)]
    if missing:
        sys.exit(f"ERROR: missing required config: {', '.join(missing)} (set in .env or the environment)")

    def get(key: str) -> str:
        return env.get(key) or DEFAULTS[key]

    return GcpConfig(
        project_id=env["GCP_PROJECT_ID"],
        region=get("GCP_REGION"),
        artifact_repo=get("GCP_ARTIFACT_REPO"),
        web_service_name=get("GCP_WEB_SERVICE_NAME"),
        mcp_service_name=get("GCP_MCP_SERVICE_NAME"),
    )


def resolve_env() -> dict[str, str]:
    """.env values, overridden by real environment variables (CI override)."""
    env = read_dotenv(REPO_ROOT / ".env")
    for key, value in os.environ.items():
        if value:
            env[key] = value
    return env


def run(command: list[str], **kwargs) -> None:
    print(f"\n>>> {' '.join(command)}\n")
    result = subprocess.run(command, **kwargs)
    if result.returncode != 0:
        sys.exit(f"ERROR: command failed ({result.returncode}): {' '.join(command)}")


def run_capture(command: list[str]) -> str:
    print(f"\n>>> {' '.join(command)}\n")
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"ERROR: command failed ({result.returncode}): {' '.join(command)}\n{result.stderr}")
    return result.stdout.strip()


def ensure_artifact_registry(config: GcpConfig) -> None:
    if config.artifact_repo in LEGACY_GCR_HOSTS:
        # Legacy Container Registry hostnames are automatically backed by
        # Artifact Registry - there's no repository resource to create.
        return
    print("\nEnsuring Artifact Registry repository exists...\n")
    # Not run via run()/run_capture(): "already exists" is the common, expected
    # outcome here and shouldn't print as if it were a real command being run;
    # a real failure still surfaces loudly at the docker push step right after.
    subprocess.run(
        [
            "gcloud", "artifacts", "repositories", "create", config.artifact_repo,
            "--repository-format=docker",
            f"--location={config.region}",
            "--description=governed-superpowers deploy",
            "--quiet",
        ],
        capture_output=True,
        text=True,
    )


def apply_supabase_migrations(env: dict[str, str]) -> None:
    supabase_db_url = env.get("SUPABASE_DB_URL")
    if not supabase_db_url:
        print("SUPABASE_DB_URL not set - skipping cloud migration step.")
        return
    print("\nApplying Prisma migrations against Supabase...\n")
    migrate_env = dict(os.environ)
    migrate_env["DATABASE_URL"] = supabase_db_url
    migrate_env["DIRECT_URL"] = supabase_db_url
    run(["npx", "prisma", "migrate", "deploy"], cwd=str(REPO_ROOT / "web"), env=migrate_env)


def build_and_push(image: str, dockerfile: str, context: str, target: str | None = None) -> None:
    print(f"\nBuilding {image}...\n")
    command = ["docker", "build", "-f", dockerfile, "-t", image]
    if target:
        command += ["--target", target]
    command += [context]
    run(command)
    run(["docker", "push", image])


def write_env_vars_file(env_vars: dict[str, str]) -> Path:
    """Write env vars to a temp YAML file for `gcloud run deploy --env-vars-file`.
    Keeps secrets (DATABASE_URL, SMTP_PASSWORD, ...) out of argv and out of the
    command-echo in run() - both leak plaintext secrets to stdout/CI logs if
    passed via --set-env-vars instead. Also avoids --set-env-vars using ',' as
    both the pair separator and a legal character inside a secret value.
    """
    fd, path = tempfile.mkstemp(suffix=".yaml")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        for key, value in env_vars.items():
            escaped = value.replace('\\', '\\\\').replace('"', '\\"')
            f.write(f'{key}: "{escaped}"\n')
    return Path(path)


def deploy_mcp_server(config: GcpConfig, database_url: str) -> str:
    image = config.image_path(config.mcp_service_name)
    build_and_push(image, dockerfile=str(REPO_ROOT / "mcp-server" / "Dockerfile"), context=str(REPO_ROOT))

    print(f"\nDeploying {config.mcp_service_name} to Cloud Run...\n")
    env_vars_file = write_env_vars_file({"DATABASE_URL": database_url, "PORT": "3000"})
    try:
        run(
            [
                "gcloud", "run", "deploy", config.mcp_service_name,
                "--image", image,
                "--platform", "managed",
                "--region", config.region,
                "--port", "3000",
                "--env-vars-file", str(env_vars_file),
                "--allow-unauthenticated",
            ]
        )
    finally:
        env_vars_file.unlink(missing_ok=True)

    return run_capture(
        [
            "gcloud", "run", "services", "describe", config.mcp_service_name,
            "--platform", "managed", "--region", config.region,
            "--format", "value(status.url)",
        ]
    )


def deploy_web(config: GcpConfig, env: dict[str, str], database_url: str) -> str:
    image = config.image_path(config.web_service_name)
    build_and_push(image, dockerfile=str(REPO_ROOT / "web" / "Dockerfile"), context=str(REPO_ROOT / "web"), target="runtime")

    env_vars = {"DATABASE_URL": database_url, "PORT": "3000"}
    for key in WEB_ENV_PASSTHROUGH_KEYS:
        if env.get(key):
            env_vars[key] = env[key]
    app_url = env.get("APP_URL")
    if app_url:
        env_vars["APP_URL"] = app_url

    print(f"\nDeploying {config.web_service_name} to Cloud Run...\n")
    env_vars_file = write_env_vars_file(env_vars)
    try:
        run(
            [
                "gcloud", "run", "deploy", config.web_service_name,
                "--image", image,
                "--platform", "managed",
                "--region", config.region,
                "--port", "3000",
                "--env-vars-file", str(env_vars_file),
                "--allow-unauthenticated",
            ]
        )
    finally:
        env_vars_file.unlink(missing_ok=True)

    service_url = run_capture(
        [
            "gcloud", "run", "services", "describe", config.web_service_name,
            "--platform", "managed", "--region", config.region,
            "--format", "value(status.url)",
        ]
    )

    if not app_url:
        print(f"\nAPP_URL not set in .env - updating {config.web_service_name} with its Cloud Run URL ({service_url})...\n")
        run(
            [
                "gcloud", "run", "services", "update", config.web_service_name,
                "--region", config.region,
                "--update-env-vars", f"APP_URL={service_url}",
            ]
        )
        return service_url
    return app_url


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.parse_args()

    env = resolve_env()
    config = load_config(env)

    database_url = env.get("DATABASE_URL")
    if not database_url:
        sys.exit("ERROR: DATABASE_URL must be set in .env (Supabase pooled connection, or your own managed Postgres).")

    print(f"Project:  {config.project_id}")
    print(f"Region:   {config.region}")

    if not os.environ.get("CI"):
        run(["gcloud", "auth", "login"])
    run(["gcloud", "config", "set", "project", config.project_id])
    ensure_artifact_registry(config)
    run(["gcloud", "auth", "configure-docker", "--quiet"])

    apply_supabase_migrations(env)

    mcp_url = deploy_mcp_server(config, database_url)
    web_url = deploy_web(config, env, database_url)

    print("\n================================================")
    print(" Deployment complete")
    print("================================================\n")
    print(f"Portal:  {web_url}")
    print(f"MCP:     {mcp_url}/mcp")
    print("\nNext: open the portal URL, sign up, confirm your email, mint a token on the")
    print("Tokens page, then:")
    print(f'  claude mcp add --transport http governed-superpowers {mcp_url}/mcp \\')
    print('    --header "Authorization: Bearer <your token>"')


if __name__ == "__main__":
    main()
