#!/usr/bin/env python3
"""Smoke test OpenClaw against a deployed Project environment."""

from __future__ import annotations

import argparse
import json
import random
import string
import time
import uuid

import httpx


def _random_suffix(length: int = 8) -> str:
    chars = string.ascii_lowercase + string.digits
    return "".join(random.choice(chars) for _ in range(length))


def _wait_for_health(client: httpx.Client, timeout_seconds: int) -> None:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        try:
            resp = client.get("/api/health")
            if resp.status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(5)
    raise RuntimeError("Timed out waiting for /api/health")


def _wait_for_status(
    client: httpx.Client,
    *,
    headers: dict[str, str],
    expected_status: str,
    timeout_seconds: int = 60,
) -> dict:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        status_payload = _require_ok(client.get("/api/agent/status", headers=headers), "agent status")
        if status_payload.get("status") == expected_status:
            return status_payload
        time.sleep(2)
    raise RuntimeError(f"Timed out waiting for /api/agent/status={expected_status}")


def _require_ok(response: httpx.Response, label: str) -> dict:
    if response.status_code >= 400:
        raise RuntimeError(f"{label} failed ({response.status_code}): {response.text[:500]}")
    if not response.content:
        return {}
    try:
        return response.json()
    except ValueError:
        return {}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="Public app base URL")
    parser.add_argument("--api-key", required=True, help="OpenRouter API key for smoke user")
    parser.add_argument("--model", default="google/gemini-2.5-flash", help="OpenRouter model")
    parser.add_argument("--wait-seconds", type=int, default=900, help="Max health wait")
    parser.add_argument(
        "--expected-runtime-host-suffix",
        default=".svc.cluster.local:18789",
        help="Expected OpenClaw runtime host suffix from /api/agent/status",
    )
    args = parser.parse_args()

    password = "OpenClawSmoke1!"
    suffix = _random_suffix()
    email = f"smoke-openclaw-{suffix}@example.com"
    username = f"smoke_openclaw_{suffix}"
    conversation_id = f"smoke-openclaw-{uuid.uuid4()}"

    with httpx.Client(base_url=args.base_url.rstrip("/"), timeout=120.0) as client:
        _wait_for_health(client, args.wait_seconds)

        _require_ok(
            client.post(
                "/api/auth/register",
                json={"email": email, "username": username, "password": password},
            ),
            "register",
        )
        login = _require_ok(
            client.post("/api/auth/login", json={"email": email, "password": password}),
            "login",
        )
        org_id = str(login.get("default_org_id") or "")
        if not org_id:
            orgs = _require_ok(client.get("/api/orgs"), "org list")
            if not isinstance(orgs, list) or not orgs:
                raise RuntimeError("No organization available for smoke user")
            org_id = str(orgs[0]["id"])

        csrf = _require_ok(client.get("/api/auth/csrf"), "csrf")
        csrf_token = str(csrf.get("csrf_token") or "")
        if not csrf_token:
            raise RuntimeError("Missing CSRF token")

        headers = {
            "X-CSRF-Token": csrf_token,
            "X-Org-Id": org_id,
        }

        _require_ok(
            client.put(
                "/api/agent/settings",
                headers=headers,
                json={
                    "agentBackend": "openclaw",
                    "provider": "openrouter",
                    "apiKey": args.api_key,
                    "model": args.model,
                },
            ),
            "agent settings update",
        )

        chat_resp = client.post(
            "/api/chat/completions",
            headers=headers,
            json={
                "message": "Reply with exactly one word: ready",
                "conversationId": conversation_id,
            },
            timeout=180.0,
        )
        if chat_resp.status_code >= 400:
            raise RuntimeError(
                f"chat completions failed ({chat_resp.status_code}): {chat_resp.text[:500]}"
            )

        saw_done = False
        saw_text = False
        error_messages: list[str] = []
        for raw_line in chat_resp.text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except ValueError:
                continue
            event_type = event.get("type")
            if event_type == "text_delta" and event.get("content"):
                saw_text = True
            elif event_type == "done":
                saw_done = True
            elif event_type == "error":
                detail = str(event.get("detail") or "unknown error")
                error_messages.append(detail)

        if error_messages:
            raise RuntimeError(f"openclaw stream returned errors: {error_messages}")
        if not saw_done:
            raise RuntimeError("openclaw stream did not emit done event")
        if not saw_text:
            raise RuntimeError("openclaw stream returned no text deltas")

        running_status = _wait_for_status(
            client,
            headers=headers,
            expected_status="running",
            timeout_seconds=60,
        )
        runtime_url = str(running_status.get("url") or "")
        if args.expected_runtime_host_suffix not in runtime_url:
            raise RuntimeError(
                "runtime URL does not look like k8s DNS: "
                f"{runtime_url!r} (expected suffix {args.expected_runtime_host_suffix!r})"
            )

        _require_ok(client.post("/api/agent/container/stop", headers=headers), "container stop")
        stopped_status = _wait_for_status(
            client,
            headers=headers,
            expected_status="stopped",
            timeout_seconds=60,
        )
        if stopped_status.get("url") is not None:
            raise RuntimeError("container stop did not clear container URL")

    print("OpenClaw production smoke passed.")


if __name__ == "__main__":
    main()
