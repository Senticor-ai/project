#!/usr/bin/env python3
"""Container integration smoke tests for CI.

Validates that the just-built container images can:
1. Start and serve health endpoints (all 5 services)
2. Proxy API requests through nginx
3. Handle user registration/login flows
4. Perform basic CRUD operations with correct response shapes
"""

from __future__ import annotations

import argparse
import random
import string
import subprocess
import sys
import time
import uuid

import httpx


def _random_suffix(length: int = 8) -> str:
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choice(chars) for _ in range(length))


def _require_ok(response: httpx.Response, label: str) -> dict:
    if response.status_code >= 400:
        raise AssertionError(f"{label} failed ({response.status_code}): {response.text[:500]}")
    if not response.content:
        return {}
    try:
        return response.json()
    except ValueError:
        return {}


def _wait_for_ready(
    client: httpx.Client,
    path: str,
    timeout: int,
    *,
    accept_codes: set[int] | None = None,
) -> None:
    """Poll an endpoint until it responds with an acceptable status code."""
    ok_codes = accept_codes or {200}
    deadline = time.monotonic() + timeout
    last_error = ""
    while time.monotonic() < deadline:
        try:
            r = client.get(path)
            if r.status_code in ok_codes:
                return
            last_error = f"status {r.status_code}"
        except httpx.HTTPError as exc:
            last_error = str(exc)
        time.sleep(2)
    raise RuntimeError(f"Timed out waiting for {client.base_url}{path}: {last_error}")


def _assert_fields(data: dict, fields: list[str], label: str) -> None:
    missing = [f for f in fields if f not in data]
    if missing:
        raise AssertionError(f"{label}: missing fields {missing} in {list(data.keys())}")


# ---------------------------------------------------------------------------
# Tier 1: Health checks
# ---------------------------------------------------------------------------


def test_backend_health(backend: httpx.Client) -> None:
    data = _require_ok(backend.get("/health"), "backend /health")
    assert data.get("status") == "ok", f"backend /health status: {data}"


def test_backend_schema_health(backend: httpx.Client) -> None:
    data = _require_ok(backend.get("/health/schema"), "backend /health/schema")
    if data.get("status") != "ok":
        raise AssertionError(
            f"backend /health/schema degraded: missing={data.get('missing_tables')}, "
            f"warnings={data.get('warnings')}"
        )


def test_agents_health(agents: httpx.Client) -> None:
    data = _require_ok(agents.get("/health"), "agents /health")
    assert data.get("status") == "ok", f"agents /health status: {data}"


def test_frontend_serves(frontend: httpx.Client) -> None:
    r = frontend.get("/")
    assert r.status_code == 200, f"frontend / returned {r.status_code}"


def test_storybook_health(storybook: httpx.Client) -> None:
    r = storybook.get("/healthz")
    assert r.status_code == 200, f"storybook /healthz returned {r.status_code}"


def test_openclaw_running(compose_file: str) -> None:
    """Verify the OpenClaw container started and is still running.

    OpenClaw only becomes fully functional when a user requests a chat
    session, so we can't hit an HTTP endpoint. Instead we check that the
    container process didn't crash on startup.
    """
    result = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            compose_file,
            "ps",
            "--format",
            "json",
            "openclaw",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(f"docker compose ps failed: {result.stderr}")
    output = result.stdout.strip()
    if not output:
        raise AssertionError("openclaw container not found in compose stack")
    # Container is running if the process started without crashing.
    if "running" not in output.lower():
        raise AssertionError(f"openclaw container not running: {output}")


# ---------------------------------------------------------------------------
# Tier 2: Nginx proxy + auth flow
# ---------------------------------------------------------------------------


def test_nginx_proxy(frontend: httpx.Client) -> None:
    data = _require_ok(frontend.get("/api/health"), "nginx proxy /api/health")
    assert data.get("status") == "ok", f"nginx proxy health: {data}"


def test_auth_flow(frontend: httpx.Client) -> dict:
    """Register + login, return login response with org_id."""
    suffix = _random_suffix()
    email = f"ci-test-{suffix}@example.com"
    username = f"ci_test_{suffix}"
    password = "CiTest1234!"

    user = _require_ok(
        frontend.post(
            "/api/auth/register",
            json={"email": email, "username": username, "password": password},
        ),
        "register",
    )
    _assert_fields(user, ["id", "email", "username", "created_at"], "register response")

    login_resp = frontend.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )
    login_data = _require_ok(login_resp, "login")
    _assert_fields(login_data, ["id", "email", "default_org_id"], "login response")

    cookies = {c.name for c in frontend.cookies.jar}
    assert "project_session" in cookies, f"session cookie not set, got: {cookies}"

    return login_data


# ---------------------------------------------------------------------------
# Tier 3: Authenticated CRUD
# ---------------------------------------------------------------------------


def test_file_upload_flow(frontend: httpx.Client, org_id: str) -> None:
    """Verify the full file upload flow works under non-root.

    This catches permission bugs where storage directories are owned by root
    but the backend runs as a non-root user (UID 1000).
    """
    headers = {"X-Org-Id": org_id}
    content = b'[{"name": "smoke test item", "state": 0}]'

    # 1. Initiate upload
    init_resp = frontend.post(
        "/api/files/initiate",
        headers=headers,
        json={
            "filename": "smoke-test.json",
            "content_type": "application/json",
            "total_size": len(content),
        },
    )
    init_data = _require_ok(init_resp, "file initiate")
    _assert_fields(init_data, ["upload_id", "upload_url", "chunk_size", "chunk_total"], "initiate")

    upload_id = init_data["upload_id"]
    chunk_total = init_data["chunk_total"]

    # 2. Upload single chunk
    upload_resp = frontend.put(
        f"/api/files/upload/{upload_id}",
        headers={
            **headers,
            "X-Chunk-Index": "0",
            "X-Chunk-Total": str(chunk_total),
        },
        content=content,
    )
    _require_ok(upload_resp, "file upload chunk")

    # 3. Complete upload
    complete_resp = frontend.post(
        "/api/files/complete",
        headers=headers,
        json={"upload_id": upload_id},
    )
    complete_data = _require_ok(complete_resp, "file complete")
    _assert_fields(complete_data, ["file_id", "original_name", "size_bytes", "sha256"], "complete")
    assert complete_data["size_bytes"] == len(content), (
        f"size mismatch: {complete_data['size_bytes']} != {len(content)}"
    )


def test_items_crud(frontend: httpx.Client, org_id: str) -> None:
    headers = {"X-Org-Id": org_id}
    canonical_id = f"urn:app:action:ci-smoke-{uuid.uuid4()}"

    item_resp = frontend.post(
        "/api/items",
        headers=headers,
        json={
            "source": "manual",
            "item": {
                "@id": canonical_id,
                "@type": "Action",
                "name": "CI smoke test item",
            },
        },
    )
    item = _require_ok(item_resp, "create item")
    expected = ["item_id", "canonical_id", "source", "item", "created_at"]
    _assert_fields(item, expected, "item response")

    item_id = item["item_id"]
    fetched = _require_ok(
        frontend.get(f"/api/items/{item_id}", headers=headers),
        "get item",
    )
    assert fetched["item_id"] == item_id, f"item_id mismatch: {fetched['item_id']} != {item_id}"
    assert fetched["item"]["name"] == "CI smoke test item"


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------

COMPOSE_FILE = "infra/docker-compose.ci-test.yml"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--backend-url", default="http://localhost:8000")
    parser.add_argument("--agents-url", default="http://localhost:8002")
    parser.add_argument("--frontend-url", default="http://localhost:8080")
    parser.add_argument("--storybook-url", default="http://localhost:6006")
    parser.add_argument("--compose-file", default=COMPOSE_FILE)
    parser.add_argument("--wait-seconds", type=int, default=120)
    args = parser.parse_args()

    errors: list[str] = []

    with (
        httpx.Client(base_url=args.backend_url, timeout=30) as backend,
        httpx.Client(base_url=args.agents_url, timeout=30) as agents,
        httpx.Client(base_url=args.frontend_url, timeout=30) as frontend,
        httpx.Client(base_url=args.storybook_url, timeout=30) as storybook,
    ):
        # Wait for HTTP services
        print("Waiting for services to become ready...")
        waits = [
            (backend, "/health"),
            (agents, "/health"),
            (frontend, "/"),
            (storybook, "/healthz"),
        ]
        for client, path in waits:
            try:
                _wait_for_ready(client, path, args.wait_seconds)
            except RuntimeError as exc:
                print(f"  FAIL  wait: {exc}")
                errors.append(f"wait: {exc}")

        if errors:
            print(f"\n{len(errors)} service(s) failed to start.")
            sys.exit(1)
        print("All services ready.\n")

        # Tier 1: health checks
        tier1: list[tuple[str, object]] = [
            ("backend_health", lambda: test_backend_health(backend)),
            ("backend_schema_health", lambda: test_backend_schema_health(backend)),
            ("agents_health", lambda: test_agents_health(agents)),
            ("frontend_serves", lambda: test_frontend_serves(frontend)),
            ("storybook_health", lambda: test_storybook_health(storybook)),
            ("openclaw_running", lambda: test_openclaw_running(args.compose_file)),
        ]
        for name, fn in tier1:
            try:
                fn()  # type: ignore[operator]
                print(f"  PASS  {name}")
            except Exception as exc:
                print(f"  FAIL  {name}: {exc}")
                errors.append(f"{name}: {exc}")

        # Tier 2: proxy + auth (uses frontend for cookie persistence)
        try:
            test_nginx_proxy(frontend)
            print("  PASS  nginx_proxy")
        except Exception as exc:
            print(f"  FAIL  nginx_proxy: {exc}")
            errors.append(f"nginx_proxy: {exc}")

        auth_result: dict = {}
        try:
            auth_result = test_auth_flow(frontend)
            print("  PASS  auth_flow")
        except Exception as exc:
            print(f"  FAIL  auth_flow: {exc}")
            errors.append(f"auth_flow: {exc}")

        # Tier 3: Authenticated operations (requires auth)
        org_id = str(auth_result.get("default_org_id", ""))
        if org_id:
            for name, fn in [
                ("file_upload_flow", lambda: test_file_upload_flow(frontend, org_id)),
                ("items_crud", lambda: test_items_crud(frontend, org_id)),
            ]:
                try:
                    fn()  # type: ignore[operator]
                    print(f"  PASS  {name}")
                except Exception as exc:
                    print(f"  FAIL  {name}: {exc}")
                    errors.append(f"{name}: {exc}")
        elif not errors:
            print("  SKIP  tier3 (no org_id from auth)")

    print()
    if errors:
        print(f"{len(errors)} test(s) failed:")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)

    print("All container integration tests passed.")


if __name__ == "__main__":
    main()
