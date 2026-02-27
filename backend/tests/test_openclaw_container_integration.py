"""Integration tests for real OpenClaw containers.

These tests are opt-in and require:
- OPENCLAW_INTEGRATION_TESTS=1
- OPENROUTER_API_KEY
- docker/nerdctl/podman runtime available
"""

from __future__ import annotations

import json
import os
import re
import time
import uuid
from pathlib import Path

import httpx
import pytest

from app.config import settings
from app.container.manager import ensure_running, hard_refresh_container, stop_container
from app.container.runtime import NoRuntimeError, detect_runtime
from app.db import db_conn
from app.email.crypto import CryptoService

pytestmark = pytest.mark.external


def _is_truthy(value: str | None) -> bool:
    return (value or "").strip().lower() in {"1", "true", "yes", "on"}


@pytest.fixture(scope="session")
def openclaw_integration_env() -> dict[str, str]:
    if not _is_truthy(os.getenv("OPENCLAW_INTEGRATION_TESTS")):
        pytest.skip("Set OPENCLAW_INTEGRATION_TESTS=1 to run OpenClaw container integration tests")

    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        pytest.skip("OPENROUTER_API_KEY is required for OpenClaw integration tests")

    try:
        detect_runtime()
    except NoRuntimeError as exc:
        pytest.skip(str(exc))

    return {
        "provider": "openrouter",
        "api_key": api_key,
        "model": os.getenv("OPENCLAW_INTEGRATION_MODEL", "google/gemini-2.5-flash"),
    }


def _register_and_login(client) -> tuple[str, str]:
    email = f"user-{uuid.uuid4().hex}@example.com"
    username = f"user-{uuid.uuid4().hex}"
    password = "Testpass1!"

    register = client.post(
        "/auth/register",
        json={"email": email, "username": username, "password": password},
    )
    assert register.status_code == 200

    login = client.post("/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    payload = login.json()
    client.headers.update({"X-Org-Id": payload["default_org_id"]})
    return payload["id"], payload["default_org_id"]


def _set_user_openclaw_settings(
    *,
    user_id: str,
    provider: str,
    api_key: str,
    model: str,
) -> None:
    encrypted = CryptoService().encrypt(api_key)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_agent_settings
                    (user_id, agent_backend, provider, api_key_encrypted, model)
                VALUES (%s, 'openclaw', %s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE
                SET
                    agent_backend = EXCLUDED.agent_backend,
                    provider = EXCLUDED.provider,
                    api_key_encrypted = EXCLUDED.api_key_encrypted,
                    model = EXCLUDED.model,
                    updated_at = now()
                """,
                (user_id, provider, encrypted, model),
            )
        conn.commit()


def _expected_model(provider: str, model: str) -> str:
    if provider == "openrouter" and not model.startswith("openrouter/"):
        return f"openrouter/{model}"
    return model


def _workspace_dir(user_id: str) -> Path:
    return settings.file_storage_path.resolve() / "openclaw" / user_id / "workspace"


def _config_path(user_id: str) -> Path:
    return settings.file_storage_path.resolve() / "openclaw" / user_id / "openclaw.json"


def _container_row(user_id: str) -> dict[str, object]:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT container_name, container_status, container_url, container_port, container_error
                FROM user_agent_settings
                WHERE user_id = %s
                """,
                (user_id,),
            )
            row = cur.fetchone()
    assert row is not None
    return row


def _cleanup_user(user_id: str) -> None:
    try:
        stop_container(user_id)
    finally:
        try:
            hard_refresh_container(user_id)
        except Exception:
            pass


def _chat_once(container_url: str, token: str, message: str) -> str:
    response = httpx.post(
        f"{container_url}/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {token}",
            "x-openclaw-agent-id": "openclaw",
            "Content-Type": "application/json",
        },
        json={
            "model": "openclaw",
            "messages": [{"role": "user", "content": message}],
            "stream": False,
        },
        timeout=120.0,
    )
    response.raise_for_status()
    payload = response.json()
    choices = payload.get("choices") or []
    if not choices:
        return ""
    message_payload = choices[0].get("message") or {}
    content = message_payload.get("content")
    if not isinstance(content, str):
        return ""
    return content


def _looks_like_bootstrap_prompt(text: str) -> bool:
    lower = text.lower()
    keywords = ("name", "namen", "creature", "natur", "vibe", "stimmung", "emoji")
    hits = sum(1 for keyword in keywords if keyword in lower)
    return hits >= 2


def _wait_for_bootstrap_files(workspace_dir: Path, timeout_seconds: int = 45) -> tuple[Path, Path]:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        soul = workspace_dir / "SOUL.md"
        memory_candidates = [workspace_dir / "MEMORY.md", workspace_dir / "memory.md"]
        memory = next(
            (
                candidate
                for candidate in memory_candidates
                if candidate.is_file() and candidate.stat().st_size > 0
            ),
            None,
        )
        if soul.is_file() and soul.stat().st_size > 0 and memory is not None:
            return soul, memory
        time.sleep(1.0)

    files = sorted(path.name for path in workspace_dir.iterdir()) if workspace_dir.exists() else []
    raise AssertionError(f"Expected SOUL.md and MEMORY.md/memory.md in workspace. Found: {files}")


def test_openclaw_container_starts_with_user_settings(client, openclaw_integration_env):
    user_id, _org_id = _register_and_login(client)
    try:
        _set_user_openclaw_settings(
            user_id=user_id,
            provider=openclaw_integration_env["provider"],
            api_key=openclaw_integration_env["api_key"],
            model=openclaw_integration_env["model"],
        )

        container_url, token = ensure_running(user_id)
        row = _container_row(user_id)

        assert row["container_status"] == "running"
        assert row["container_name"] == f"openclaw-{user_id}"
        assert isinstance(row["container_port"], int)
        assert row["container_url"] == container_url

        config = json.loads(_config_path(user_id).read_text())
        expected = _expected_model(
            openclaw_integration_env["provider"],
            openclaw_integration_env["model"],
        )
        assert config["agents"]["defaults"]["model"]["primary"] == expected

        reply = _chat_once(container_url, token, "Say hello in one short sentence.")
        assert reply.strip()
        assert "unknown model" not in reply.lower()
    finally:
        _cleanup_user(user_id)


def test_openclaw_first_interaction_returns_bootstrap_questions(client, openclaw_integration_env):
    user_id, _org_id = _register_and_login(client)
    try:
        _set_user_openclaw_settings(
            user_id=user_id,
            provider=openclaw_integration_env["provider"],
            api_key=openclaw_integration_env["api_key"],
            model=openclaw_integration_env["model"],
        )
        container_url, token = ensure_running(user_id)

        reply = _chat_once(
            container_url,
            token,
            "Hey. I just came online. Who am I? Who are you?",
        )
        assert reply.strip(), "OpenClaw returned an empty first reply"
        assert _looks_like_bootstrap_prompt(reply), reply
    finally:
        _cleanup_user(user_id)


def test_openclaw_initialization_creates_soul_and_memory_files(client, openclaw_integration_env):
    user_id, _org_id = _register_and_login(client)
    try:
        _set_user_openclaw_settings(
            user_id=user_id,
            provider=openclaw_integration_env["provider"],
            api_key=openclaw_integration_env["api_key"],
            model=openclaw_integration_env["model"],
        )
        container_url, token = ensure_running(user_id)

        _chat_once(container_url, token, "Hey. I just came online. Who am I? Who are you?")
        _chat_once(
            container_url,
            token,
            (
                "My name for you is OpenClaw. You are an autonomous AI assistant. "
                "Your vibe is pragmatic and calm. Emoji is claw. "
                "Please finish initialization and persist IDENTITY.md, SOUL.md, and MEMORY.md."
            ),
        )
        _chat_once(
            container_url,
            token,
            "Please verify initialization is complete and those files are saved.",
        )

        workspace = _workspace_dir(user_id)
        soul_path, memory_path = _wait_for_bootstrap_files(workspace)
        assert soul_path.read_text().strip()
        assert memory_path.read_text().strip()

        identity = (workspace / "IDENTITY.md").read_text()
        match = re.search(r"^\s*-\s*Name:\s*(.+?)\s*$", identity, flags=re.MULTILINE)
        assert match and match.group(1).strip(), identity
    finally:
        _cleanup_user(user_id)


def test_openclaw_isolates_containers_between_users(client, openclaw_integration_env):
    user_ids: list[str] = []
    try:
        user_a, _org_a = _register_and_login(client)
        user_ids.append(user_a)
        user_b, _org_b = _register_and_login(client)
        user_ids.append(user_b)

        for user_id in user_ids:
            _set_user_openclaw_settings(
                user_id=user_id,
                provider=openclaw_integration_env["provider"],
                api_key=openclaw_integration_env["api_key"],
                model=openclaw_integration_env["model"],
            )

        url_a, token_a = ensure_running(user_a)
        url_b, token_b = ensure_running(user_b)
        row_a = _container_row(user_a)
        row_b = _container_row(user_b)

        assert row_a["container_status"] == "running"
        assert row_b["container_status"] == "running"
        assert row_a["container_name"] == f"openclaw-{user_a}"
        assert row_b["container_name"] == f"openclaw-{user_b}"
        assert row_a["container_name"] != row_b["container_name"]
        assert row_a["container_port"] != row_b["container_port"]
        assert url_a != url_b

        assert _chat_once(url_a, token_a, "Reply with: user-a-ready").strip()
        assert _chat_once(url_b, token_b, "Reply with: user-b-ready").strip()
    finally:
        for user_id in user_ids:
            _cleanup_user(user_id)
