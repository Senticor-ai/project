import json
import uuid

import pytest
from playwright.sync_api import APIRequestContext, Playwright


def _org_headers(org_id: str, extra: dict | None = None) -> dict:
    headers = {"X-Org-Id": org_id, "Content-Type": "application/json"}
    if extra:
        headers.update(extra)
    return headers


def _post_json(context: APIRequestContext, url: str, payload: dict, headers: dict | None = None):
    return context.post(url, data=json.dumps(payload), headers=headers)


def _patch_json(context: APIRequestContext, url: str, payload: dict, headers: dict | None = None):
    return context.patch(url, data=json.dumps(payload), headers=headers)


def _register_and_login(context: APIRequestContext) -> dict:
    email = f"user-{uuid.uuid4().hex}@example.com"
    username = f"user-{uuid.uuid4().hex}"
    password = "Testpass1!"

    response = _post_json(
        context,
        "/auth/register",
        {"email": email, "username": username, "password": password},
        headers={"Content-Type": "application/json"},
    )
    assert response.ok

    response = _post_json(
        context,
        "/auth/login",
        {"email": email, "password": password},
        headers={"Content-Type": "application/json"},
    )
    assert response.ok
    default_org_id = response.json()["default_org_id"]

    response = context.get("/auth/me")
    assert response.ok
    user_id = response.json()["id"]

    return {
        "email": email,
        "username": username,
        "password": password,
        "org_id": default_org_id,
        "user_id": user_id,
    }


@pytest.fixture(scope="session")
def api_context(playwright: Playwright, api_base_url: str) -> tuple[APIRequestContext, str]:
    context = playwright.request.new_context(
        base_url=api_base_url,
        extra_http_headers={"X-Requested-With": "XMLHttpRequest"},
    )

    session = _register_and_login(context)
    default_org_id = session["org_id"]

    yield context, default_org_id
    context.dispose()


def test_gtd_flow_playwright(api_context: tuple[APIRequestContext, str]):
    context, default_org_id = api_context

    response = context.get("/auth/me")
    assert response.ok
    user_id = response.json()["id"]

    response = _post_json(
        context,
        "/orgs",
        {"name": "Second Workspace"},
        headers=_org_headers(default_org_id),
    )
    assert response.ok
    org_two_id = response.json()["id"]

    thing = {
        "@id": f"urn:task:{uuid.uuid4()}",
        "@type": "CreativeWork",
        "@context": "https://schema.org",
        "name": "Fix the leaky faucet",
        "keywords": ["inbox"],
        "dueDate": "2026-02-10",
    }
    idempotency_key = str(uuid.uuid4())
    response = _post_json(
        context,
        "/things",
        {"source": "manual", "thing": thing},
        headers=_org_headers(default_org_id, {"Idempotency-Key": idempotency_key}),
    )
    assert response.status == 201
    created = response.json()

    retry = _post_json(
        context,
        "/things",
        {"source": "manual", "thing": thing},
        headers=_org_headers(default_org_id, {"Idempotency-Key": idempotency_key}),
    )
    assert retry.status == 201
    assert retry.json()["thing_id"] == created["thing_id"]

    other_thing = {
        "@id": f"urn:task:{uuid.uuid4()}",
        "@type": "CreativeWork",
        "@context": "https://schema.org",
        "name": "Clean the garage",
        "keywords": ["next-actions"],
        "dueDate": "2026-02-11",
    }
    response = _post_json(
        context,
        "/things",
        {"source": "manual", "thing": other_thing},
        headers=_org_headers(org_two_id),
    )
    assert response.status == 201
    org_two_thing_id = response.json()["thing_id"]

    response = context.get("/things", headers=_org_headers(default_org_id))
    assert response.ok
    org_one_ids = {item["thing_id"] for item in response.json()}
    assert created["thing_id"] in org_one_ids
    assert org_two_thing_id not in org_one_ids

    response = context.get("/things", headers=_org_headers(org_two_id))
    assert response.ok
    org_two_ids = {item["thing_id"] for item in response.json()}
    assert org_two_thing_id in org_two_ids
    assert created["thing_id"] not in org_two_ids

    response = context.get("/things/sync?limit=50", headers=_org_headers(default_org_id))
    assert response.ok
    etag = response.headers.get("etag")
    assert etag

    response = context.get(
        "/things/sync?limit=50",
        headers=_org_headers(default_org_id, {"If-None-Match": etag}),
    )
    assert response.status == 304

    triage_payload = {
        "thing_id": created["thing_id"],
        "assertion_type": "triage",
        "payload": {"category": "next-actions", "priority": "high", "context": "home"},
        "actor_type": "user",
        "actor_id": user_id,
    }
    idempotency_key = str(uuid.uuid4())
    response = _post_json(
        context,
        "/assertions",
        triage_payload,
        headers=_org_headers(default_org_id, {"Idempotency-Key": idempotency_key}),
    )
    assert response.ok
    assertion_id = response.json()["assertion_id"]

    retry = _post_json(
        context,
        "/assertions",
        triage_payload,
        headers=_org_headers(default_org_id, {"Idempotency-Key": idempotency_key}),
    )
    assert retry.ok
    assert retry.json()["assertion_id"] == assertion_id


def test_two_user_same_todo_with_attachment(playwright: Playwright, api_base_url: str):
    user_one_ctx = playwright.request.new_context(
        base_url=api_base_url,
        extra_http_headers={"X-Requested-With": "XMLHttpRequest"},
    )
    user_two_ctx = playwright.request.new_context(
        base_url=api_base_url,
        extra_http_headers={"X-Requested-With": "XMLHttpRequest"},
    )

    user_one = _register_and_login(user_one_ctx)
    user_two = _register_and_login(user_two_ctx)

    shared_canonical_id = "urn:task:shared"
    shared_task = {
        "@id": shared_canonical_id,
        "@type": "CreativeWork",
        "@context": "https://schema.org",
        "name": "Shared Task",
        "keywords": ["inbox"],
        "dueDate": "2026-02-12",
    }

    response = _post_json(
        user_one_ctx,
        "/things",
        {"source": "manual", "thing": shared_task},
        headers=_org_headers(user_one["org_id"]),
    )
    assert response.status == 201
    user_one_thing_id = response.json()["thing_id"]

    response = _post_json(
        user_two_ctx,
        "/things",
        {"source": "manual", "thing": shared_task},
        headers=_org_headers(user_two["org_id"]),
    )
    assert response.status == 201
    user_two_thing_id = response.json()["thing_id"]
    assert user_two_thing_id != user_one_thing_id

    conflicting_task = {
        **shared_task,
        "name": "Shared Task - Updated",
    }
    response = _post_json(
        user_one_ctx,
        "/things",
        {"source": "manual", "thing": conflicting_task},
        headers=_org_headers(user_one["org_id"]),
    )
    assert response.status == 409

    data = b"playwright-attachment"
    init = _post_json(
        user_one_ctx,
        "/files/initiate",
        {"filename": "note.txt", "content_type": "text/plain", "total_size": len(data)},
        headers=_org_headers(user_one["org_id"], {"Idempotency-Key": str(uuid.uuid4())}),
    )
    assert init.status == 201
    upload = init.json()

    upload_headers = _org_headers(
        user_one["org_id"],
        {"X-Chunk-Index": "0", "X-Chunk-Total": str(upload["chunk_total"])},
    )
    response = user_one_ctx.put(
        f"/files/upload/{upload['upload_id']}",
        data=data,
        headers=upload_headers,
    )
    assert response.status == 200

    complete = _post_json(
        user_one_ctx,
        "/files/complete",
        {"upload_id": upload["upload_id"]},
        headers=_org_headers(user_one["org_id"], {"Idempotency-Key": str(uuid.uuid4())}),
    )
    assert complete.status == 201
    file_id = complete.json()["file_id"]

    response = user_one_ctx.get(f"/files/{file_id}/meta", headers=_org_headers(user_one["org_id"]))
    assert response.ok

    response = user_two_ctx.get(f"/files/{file_id}/meta", headers=_org_headers(user_two["org_id"]))
    assert response.status == 404

    attach_payload = {
        "thing_id": user_one_thing_id,
        "assertion_type": "attachment",
        "payload": {"file_id": file_id, "filename": "note.txt"},
        "actor_type": "user",
        "actor_id": user_one["user_id"],
    }
    response = _post_json(
        user_one_ctx,
        "/assertions",
        attach_payload,
        headers=_org_headers(user_one["org_id"], {"Idempotency-Key": str(uuid.uuid4())}),
    )
    assert response.ok

    user_one_ctx.dispose()
    user_two_ctx.dispose()


def test_patch_and_delete_flow_playwright(api_context: tuple[APIRequestContext, str]):
    context, default_org_id = api_context

    thing = {
        "@id": f"urn:task:{uuid.uuid4()}",
        "@type": "Action",
        "_schemaVersion": 2,
        "@context": "https://schema.org",
        "name": "Patch me",
        "meta": {"nested": {"a": 1}},
        "additionalProperty": [
            {"@type": "PropertyValue", "propertyID": "app:bucket", "value": "next"},
        ],
    }
    response = _post_json(
        context,
        "/things",
        {"source": "manual", "thing": thing},
        headers=_org_headers(default_org_id),
    )
    assert response.status == 201
    thing_id = response.json()["thing_id"]

    patch = {"thing": {"meta": {"nested": {"b": 2}}, "name": "Patched name"}}
    response = _patch_json(
        context,
        f"/things/{thing_id}",
        patch,
        headers=_org_headers(default_org_id),
    )
    assert response.status == 200
    patched = response.json()
    assert patched["thing"]["name"] == "Patched name"
    assert patched["thing"]["meta"]["nested"] == {"a": 1, "b": 2}

    response = _patch_json(
        context,
        f"/things/{thing_id}",
        {"thing": {"@id": "urn:task:other"}},
        headers=_org_headers(default_org_id),
    )
    assert response.status == 400

    response = _patch_json(
        context,
        f"/things/{thing_id}",
        {
            "thing": {
                "@type": "Action",
                "additionalProperty": [
                    {
                        "@type": "PropertyValue",
                        "propertyID": "app:bucket",
                        "value": None,
                    },
                ],
            },
        },
        headers=_org_headers(default_org_id),
    )
    assert response.status == 422

    response = context.delete(f"/things/{thing_id}", headers=_org_headers(default_org_id))
    assert response.ok

    response = context.get(f"/things/{thing_id}", headers=_org_headers(default_org_id))
    assert response.status == 404
