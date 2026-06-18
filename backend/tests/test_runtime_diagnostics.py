from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from api.diagnostics import create_diagnostics_router
from diagnostics.runtime import (
    RuntimeDiagnosticProfile,
    evaluate_profile,
    evaluate_profiles,
    runtime_diagnostics_payload,
    runtime_tool_profiles,
    profiles_from_service_config,
)


class RuntimeDiagnosticsTests(unittest.TestCase):
    def test_evaluate_profile_reports_missing_model_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            profile = RuntimeDiagnosticProfile(
                role="asr",
                name="local-asr",
                provider="custom-asr",
                model_path="${WORKSPACE_ROOT}/missing-model",
            )

            item = evaluate_profile(profile, workspace_root=workspace_root)

        self.assertEqual(item.status, "error")
        self.assertEqual(item.role, "asr")
        self.assertEqual(item.provider, "custom-asr")
        self.assertEqual(item.summary, "Model path is missing")
        self.assertEqual(item.checks[0].kind, "model_path")
        self.assertEqual(item.checks[0].status, "error")
        self.assertEqual(item.checks[0].fix, "Update the profile model_path to an existing file or directory.")

    def test_evaluate_profile_reports_required_binary_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            profile = RuntimeDiagnosticProfile(
                role="tts",
                name="local-tts",
                provider="custom-tts",
                required_bins=("python", "ffmpeg"),
            )

            item = evaluate_profile(
                profile,
                workspace_root=workspace_root,
                command_resolver=lambda command: f"/usr/bin/{command}" if command == "python" else None,
            )

        checks = {check.target: check for check in item.checks}
        self.assertEqual(checks["python"].status, "ok")
        self.assertEqual(checks["ffmpeg"].status, "error")
        self.assertEqual(checks["ffmpeg"].fix, "Install ffmpeg or make it available on PATH.")
        self.assertEqual(item.status, "error")

    def test_evaluate_profile_resolves_relative_model_path_from_cwd(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            llama_dir = workspace_root / "llama.cpp"
            llama_dir.mkdir()
            (llama_dir / "model.gguf").write_text("model", encoding="utf-8")
            profile = RuntimeDiagnosticProfile(
                role="llm",
                name="local-llm",
                provider="llama.cpp",
                cwd="${WORKSPACE_ROOT}/llama.cpp",
                model_path="./model.gguf",
            )

            item = evaluate_profile(profile, workspace_root=workspace_root)

        checks = {check.kind: check for check in item.checks}
        self.assertEqual(checks["model_path"].status, "ok")
        self.assertEqual(checks["cwd"].status, "ok")
        self.assertEqual(item.status, "ok")

    def test_evaluate_profile_resolves_relative_command_from_cwd_before_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            bin_dir = workspace_root / "llama.cpp" / "build" / "bin"
            bin_dir.mkdir(parents=True)
            server = bin_dir / "llama-server"
            server.write_text("#!/bin/sh\n", encoding="utf-8")
            profile = RuntimeDiagnosticProfile(
                role="llm",
                name="local-llm",
                provider="llama.cpp",
                cwd="${WORKSPACE_ROOT}/llama.cpp",
                required_bins=("./build/bin/llama-server",),
            )

            item = evaluate_profile(
                profile,
                workspace_root=workspace_root,
                command_resolver=lambda command: None,
            )

        checks = {check.target: check for check in item.checks}
        self.assertEqual(checks["./build/bin/llama-server"].status, "ok")
        self.assertEqual(item.status, "ok")

    def test_evaluate_profile_resolves_legacy_autodl_paths_like_service_profiles(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            legacy_model_dir = workspace_root / "Qwen3-ASR"
            legacy_project_dir = workspace_root / "BranchWhisper" / "services"
            legacy_model_dir.mkdir()
            legacy_project_dir.mkdir(parents=True)
            profile = RuntimeDiagnosticProfile(
                role="asr",
                name="legacy-asr",
                provider="qwen-asr",
                cwd="/root/autodl-tmp/project/Qwen3-ASR",
                model_path="/root/autodl-tmp/project/Qwen3-ASR",
                required_files=("/root/autodl-tmp/project/BranchWhisper/services",),
            )

            item = evaluate_profile(profile, workspace_root=workspace_root)

        checks = {check.kind: check for check in item.checks}
        self.assertEqual(checks["cwd"].status, "ok")
        self.assertEqual(checks["cwd"].metadata["resolved_target"], str(legacy_model_dir))
        self.assertEqual(checks["model_path"].status, "ok")
        self.assertEqual(checks["model_path"].metadata["resolved_target"], str(legacy_model_dir))
        self.assertEqual(checks["required_file"].status, "ok")
        self.assertEqual(checks["required_file"].metadata["resolved_target"], str(legacy_project_dir))
        self.assertEqual(item.status, "ok")

    def test_runtime_payload_preserves_relative_command_path_from_service_config(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            llama_dir = workspace_root / "llama.cpp"
            bin_dir = llama_dir / "build" / "bin"
            bin_dir.mkdir(parents=True)
            (bin_dir / "llama-server").write_text("#!/bin/sh\n", encoding="utf-8")
            (llama_dir / "model.gguf").write_text("model", encoding="utf-8")

            payload = runtime_diagnostics_payload(
                {
                    "services": {
                        "llm": {
                            "label": "Local LLM",
                            "cwd": "${WORKSPACE_ROOT}/llama.cpp",
                            "command": "./build/bin/llama-server -m ./model.gguf --port 8080",
                        }
                    }
                },
                workspace_root=workspace_root,
                command_resolver=lambda command: None,
                port_checker=lambda port: True,
            )

        checks = {check["kind"]: check for check in payload["items"][0]["checks"]}
        self.assertTrue(payload["ok"])
        self.assertEqual(checks["model_path"]["status"], "ok")
        self.assertEqual(checks["binary"]["target"], "./build/bin/llama-server")
        self.assertEqual(checks["binary"]["status"], "ok")

    def test_path_checks_include_resolution_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            llama_dir = workspace_root / "llama.cpp"
            bin_dir = llama_dir / "build" / "bin"
            model_dir = llama_dir / "models"
            bin_dir.mkdir(parents=True)
            model_dir.mkdir()
            (bin_dir / "llama-server").write_text("#!/bin/sh\n", encoding="utf-8")
            (model_dir / "tokenizer.model").write_text("tokenizer", encoding="utf-8")
            profile = RuntimeDiagnosticProfile(
                role="llm",
                name="local-llm",
                provider="llama.cpp",
                cwd="${WORKSPACE_ROOT}/llama.cpp",
                model_path="./models/missing.gguf",
                required_bins=("./build/bin/llama-server",),
                required_files=("tokenizer.model",),
            )

            item = evaluate_profile(
                profile,
                workspace_root=workspace_root,
                command_resolver=lambda command: None,
            )

        checks = {check.kind: check for check in item.checks}
        cwd_metadata = checks["cwd"].metadata
        self.assertEqual(cwd_metadata["raw_target"], "${WORKSPACE_ROOT}/llama.cpp")
        self.assertEqual(cwd_metadata["resolved_target"], str(llama_dir))
        self.assertEqual(cwd_metadata["resolution_base"], str(workspace_root))
        self.assertEqual(cwd_metadata["exists"], True)
        self.assertEqual(cwd_metadata["profile_cwd"], str(llama_dir))
        self.assertEqual(cwd_metadata["workspace_root"], str(workspace_root))

        model_metadata = checks["model_path"].metadata
        self.assertEqual(model_metadata["raw_target"], "./models/missing.gguf")
        self.assertEqual(model_metadata["resolved_target"], str(model_dir / "missing.gguf"))
        self.assertEqual(model_metadata["resolution_base"], str(llama_dir))
        self.assertEqual(model_metadata["exists"], False)
        self.assertEqual(model_metadata["profile_cwd"], str(llama_dir))
        self.assertEqual(model_metadata["workspace_root"], str(workspace_root))

        binary_metadata = checks["binary"].metadata
        self.assertEqual(binary_metadata["raw_target"], "./build/bin/llama-server")
        self.assertEqual(binary_metadata["resolved_target"], str(bin_dir / "llama-server"))
        self.assertEqual(binary_metadata["resolution_base"], str(llama_dir))
        self.assertEqual(binary_metadata["exists"], True)
        self.assertEqual(binary_metadata["profile_cwd"], str(llama_dir))
        self.assertEqual(binary_metadata["workspace_root"], str(workspace_root))

        required_file_metadata = checks["required_file"].metadata
        self.assertEqual(required_file_metadata["raw_target"], "tokenizer.model")
        self.assertEqual(required_file_metadata["resolved_target"], str(model_dir / "tokenizer.model"))
        self.assertEqual(required_file_metadata["resolution_base"], str(model_dir))
        self.assertEqual(required_file_metadata["exists"], True)
        self.assertEqual(required_file_metadata["profile_cwd"], str(llama_dir))
        self.assertEqual(required_file_metadata["workspace_root"], str(workspace_root))

    def test_evaluate_profile_reports_port_conflict(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            profile = RuntimeDiagnosticProfile(
                role="llm",
                name="local-llm",
                provider="custom-llm",
                port=8000,
            )

            item = evaluate_profile(
                profile,
                workspace_root=workspace_root,
                port_checker=lambda port: port != 8000,
            )

        self.assertEqual(item.status, "error")
        self.assertEqual(item.summary, "Port is already in use")
        self.assertEqual(item.checks[0].kind, "port")
        self.assertEqual(item.checks[0].fix, "Stop the process using port 8000 or choose another port.")

    def test_evaluate_profile_reports_health_warning(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            profile = RuntimeDiagnosticProfile(
                role="llm",
                name="api-llm",
                provider="openai-compatible",
                health_url="http://127.0.0.1:9000/health",
            )

            item = evaluate_profile(
                profile,
                workspace_root=workspace_root,
                health_checker=lambda url: (False, "connection refused"),
            )

        self.assertEqual(item.status, "warning")
        self.assertEqual(item.summary, "Health endpoint is not responding")
        self.assertEqual(item.checks[0].status, "warning")
        self.assertEqual(item.checks[0].message, "connection refused")

    def test_evaluate_profiles_returns_overall_status(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            ok_dir = workspace_root / "model"
            ok_dir.mkdir()
            profiles = [
                RuntimeDiagnosticProfile(role="asr", name="asr", provider="custom", model_path=str(ok_dir)),
                RuntimeDiagnosticProfile(role="tts", name="tts", provider="custom", model_path=str(workspace_root / "missing")),
            ]

            payload = evaluate_profiles(profiles, workspace_root=workspace_root)

        self.assertIs(payload["ok"], False)
        self.assertEqual(payload["status"], "error")
        self.assertEqual([item["role"] for item in payload["items"]], ["asr", "tts"])
        self.assertEqual(payload["items"][0]["status"], "ok")
        self.assertEqual(payload["items"][1]["status"], "error")

    def test_profiles_from_service_config_adapts_existing_service_shape(self) -> None:
        config = {
            "services": {
                "asr": {
                    "label": "Local ASR",
                    "cwd": "${WORKSPACE_ROOT}",
                    "command": "conda run -n qwen3-asr qwen-asr-serve ${WORKSPACE_ROOT}/models/asr --port 8001",
                    "health_url": "http://127.0.0.1:8001/health",
                },
                "llm": {
                    "label": "Local LLM",
                    "provider": "custom-llm",
                    "cwd": "${WORKSPACE_ROOT}/llama.cpp",
                    "command": "./llama-server -m ./model.gguf --port 8080",
                    "health_url": "http://127.0.0.1:8080/health",
                },
                "tts": {
                    "label": "Local TTS",
                    "command": "python server.py --model_dir ${WORKSPACE_ROOT}/tts-model --port 50000",
                    "health_url": "http://127.0.0.1:50000/health",
                },
            }
        }

        profiles = profiles_from_service_config(config)

        self.assertEqual([profile.role for profile in profiles], ["asr", "llm", "tts"])
        self.assertEqual(profiles[0].name, "Local ASR")
        self.assertEqual(profiles[0].provider, "asr")
        self.assertEqual(profiles[0].cwd, "${WORKSPACE_ROOT}")
        self.assertEqual(profiles[0].port, 8001)
        self.assertEqual(profiles[0].health_url, "http://127.0.0.1:8001/health")
        self.assertEqual(profiles[0].model_path, "${WORKSPACE_ROOT}/models/asr")
        self.assertEqual(profiles[0].required_bins, ("conda",))
        self.assertEqual(profiles[1].provider, "custom-llm")
        self.assertEqual(profiles[1].model_path, "./model.gguf")
        self.assertEqual(profiles[2].required_bins, ("python",))

    def test_profiles_from_service_config_accepts_plain_services_mapping(self) -> None:
        profiles = profiles_from_service_config(
            {
                "asr": {
                    "label": "ASR",
                    "command": "python -m server --host 0.0.0.0 --port 7010",
                }
            }
        )

        self.assertEqual(len(profiles), 1)
        self.assertEqual(profiles[0].role, "asr")
        self.assertEqual(profiles[0].port, 7010)

    def test_runtime_diagnostics_payload_uses_service_config(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            model_dir = workspace_root / "models" / "asr"
            model_dir.mkdir(parents=True)
            payload = runtime_diagnostics_payload(
                {
                    "services": {
                        "asr": {
                            "label": "ASR",
                            "command": "python server.py --model_dir ${WORKSPACE_ROOT}/models/asr --port 7010",
                            "health_url": "http://127.0.0.1:7010/health",
                        }
                    }
                },
                workspace_root=workspace_root,
                command_resolver=lambda command: "/usr/bin/python" if command == "python" else None,
                port_checker=lambda port: True,
                health_checker=lambda url: (True, "ok"),
            )

        self.assertTrue(payload["ok"])
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["summary"]["total"], 1)
        self.assertEqual(payload["summary"]["ok"], 1)
        self.assertEqual(payload["summary"]["warning"], 0)
        self.assertEqual(payload["summary"]["error"], 0)
        self.assertEqual(payload["items"][0]["role"], "asr")
        self.assertEqual(payload["items"][0]["checks"][0]["kind"], "model_path")

    def test_runtime_tool_profiles_report_required_and_optional_tools(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            python_bin = workspace_root / "conda" / "envs" / "qwen3-asr" / "bin" / "python"
            python_bin.parent.mkdir(parents=True)
            python_bin.write_text("#!/bin/sh\n", encoding="utf-8")

            payload = evaluate_profiles(
                runtime_tool_profiles(python_executable=str(python_bin)),
                workspace_root=workspace_root,
                command_resolver=lambda command: f"/usr/bin/{command}" if command in {"node", "npm"} else None,
            )

        items = {item["provider"]: item for item in payload["items"]}
        self.assertEqual(items["python"]["role"], "tool")
        self.assertEqual(items["python"]["status"], "ok")
        self.assertEqual(items["node"]["status"], "ok")
        self.assertEqual(items["npm"]["status"], "ok")
        self.assertEqual(items["ffmpeg"]["status"], "warning")
        self.assertEqual(items["cuda"]["status"], "warning")
        self.assertEqual(items["openclaw"]["status"], "warning")
        self.assertEqual(items["openclaw"]["checks"][0]["fix"], "Install openclaw or make it available on PATH.")
        self.assertEqual(payload["status"], "warning")

    def test_runtime_diagnostics_payload_can_include_runtime_tools(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace_root = Path(temp_dir)
            python_bin = workspace_root / "python"
            python_bin.write_text("#!/bin/sh\n", encoding="utf-8")

            payload = runtime_diagnostics_payload(
                {"services": {}},
                workspace_root=workspace_root,
                extra_profiles=runtime_tool_profiles(python_executable=str(python_bin)),
                command_resolver=lambda command: f"/usr/bin/{command}",
            )

        self.assertEqual(payload["summary"]["total"], 6)
        self.assertEqual(payload["summary"]["ok"], 6)
        self.assertEqual({item["role"] for item in payload["items"]}, {"tool"})
        self.assertEqual({item["provider"] for item in payload["items"]}, {"python", "node", "npm", "ffmpeg", "cuda", "openclaw"})

    def test_runtime_diagnostics_route_returns_profile_payload(self) -> None:
        class ServiceManagerStub:
            services = {
                "asr": {
                    "label": "ASR",
                    "command": "python server.py --port 7099",
                    "health_url": "http://127.0.0.1:7099/health",
                }
            }

        app = FastAPI()
        app.state.service_manager = ServiceManagerStub()
        app.include_router(create_diagnostics_router())

        response = TestClient(app).get("/api/diagnostics/runtime")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["summary"]["total"], 7)
        self.assertEqual(payload["items"][0]["role"], "asr")
        self.assertEqual(payload["items"][0]["name"], "ASR")
        self.assertEqual({item["role"] for item in payload["items"][1:]}, {"tool"})


if __name__ == "__main__":
    unittest.main()
