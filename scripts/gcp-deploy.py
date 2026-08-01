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


@dataclass(frozen=True)
class GcpConfig:
    project_id: str
    region: str
    artifact_repo: str
    web_service_name: str
    mcp_service_name: str

    def image_path(self, service_name: str) -> str:
        return f"{self.artifact_repo}/{self.project_id}/{service_name}"


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


if __name__ == "__main__":
    # Deployment steps land in a later task - this file is import-safe (no
    # side effects at import time) so scripts/test_gcp_deploy.py can import
    # GcpConfig/load_config without shelling out to gcloud/docker.
    pass
