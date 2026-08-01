import importlib.util
import sys
import unittest
from pathlib import Path

# gcp-deploy.py has a hyphen, so it can't be imported as a normal module - load it by path instead.
_MODULE_PATH = Path(__file__).resolve().parent / "gcp-deploy.py"
_spec = importlib.util.spec_from_file_location("gcp_deploy", _MODULE_PATH)
gcp_deploy = importlib.util.module_from_spec(_spec)
sys.modules["gcp_deploy"] = gcp_deploy
_spec.loader.exec_module(gcp_deploy)

GcpConfig = gcp_deploy.GcpConfig
load_config = gcp_deploy.load_config


class LoadConfigTests(unittest.TestCase):
    def test_reads_all_keys_from_env(self):
        env = {
            "GCP_PROJECT_ID": "my-project",
            "GCP_REGION": "us-east1",
            "GCP_ARTIFACT_REPO": "my-repo",
            "GCP_WEB_SERVICE_NAME": "my-web",
            "GCP_MCP_SERVICE_NAME": "my-mcp",
        }
        config = load_config(env)
        self.assertEqual(
            config,
            GcpConfig(
                project_id="my-project",
                region="us-east1",
                artifact_repo="my-repo",
                web_service_name="my-web",
                mcp_service_name="my-mcp",
            ),
        )

    def test_applies_defaults_when_optional_keys_missing(self):
        config = load_config({"GCP_PROJECT_ID": "my-project"})
        self.assertEqual(config.region, "us-central1")
        self.assertEqual(config.artifact_repo, "gcr.io")
        self.assertEqual(config.web_service_name, "governed-superpowers-web")
        self.assertEqual(config.mcp_service_name, "governed-superpowers-mcp")

    def test_raises_when_project_id_missing(self):
        with self.assertRaises(SystemExit):
            load_config({})

    def test_image_path_uses_artifact_repo_and_project(self):
        config = load_config({"GCP_PROJECT_ID": "my-project", "GCP_ARTIFACT_REPO": "gcr.io"})
        self.assertEqual(config.image_path("governed-superpowers-web"), "gcr.io/my-project/governed-superpowers-web")

    def test_image_path_uses_artifact_registry_format_for_real_repos(self):
        config = load_config({
            "GCP_PROJECT_ID": "my-project",
            "GCP_REGION": "us-central1",
            "GCP_ARTIFACT_REPO": "my-repo",
        })
        self.assertEqual(
            config.image_path("governed-superpowers-web"),
            "us-central1-docker.pkg.dev/my-project/my-repo/governed-superpowers-web",
        )


if __name__ == "__main__":
    unittest.main()
