import uuid

from fastapi.testclient import TestClient


def _register_and_login(client: TestClient) -> dict[str, str]:
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

    org_id = payload["default_org_id"]
    user_id = payload["id"]
    client.headers.update({"X-Org-Id": org_id})

    return {
        "email": email,
        "org_id": org_id,
        "user_id": user_id,
    }


def _create_project(owner_client: TestClient) -> str:
    project_id = f"urn:app:project:{uuid.uuid4()}"
    response = owner_client.post(
        "/items",
        json={
            "source": "manual",
            "item": {
                "@id": project_id,
                "@type": "Project",
                "_schemaVersion": 2,
                "name": "Shared project",
            },
        },
    )
    assert response.status_code == 201
    return project_id


def _setup_shared_project(app) -> tuple[TestClient, TestClient, dict[str, str], dict[str, str], str]:
    owner_client = TestClient(app)
    member_client = TestClient(app)

    owner = _register_and_login(owner_client)
    member = _register_and_login(member_client)

    project_id = _create_project(owner_client)
    invite = owner_client.post(
        f"/projects/{project_id}/members",
        json={"email": member["email"]},
    )
    assert invite.status_code == 201

    member_client.headers.update({"X-Org-Id": owner["org_id"]})
    return owner_client, member_client, owner, member, project_id


def test_project_sharing_requires_registered_user_and_lists_collaborators(app):
    owner_client = TestClient(app)
    member_client = TestClient(app)

    owner = _register_and_login(owner_client)
    member = _register_and_login(member_client)
    project_id = _create_project(owner_client)

    add_member = owner_client.post(
        f"/projects/{project_id}/members",
        json={"email": member["email"]},
    )
    assert add_member.status_code == 201

    reject_unregistered = owner_client.post(
        f"/projects/{project_id}/members",
        json={"email": f"missing-{uuid.uuid4().hex}@example.com"},
    )
    assert reject_unregistered.status_code == 404
    assert "register first" in reject_unregistered.json()["detail"]

    member_client.headers.update({"X-Org-Id": owner["org_id"]})
    members = member_client.get(f"/projects/{project_id}/members")
    assert members.status_code == 200

    emails = {entry["email"] for entry in members.json()}
    assert owner["email"] in emails
    assert member["email"] in emails


def test_member_can_manage_project_actions_through_api(app):
    owner_client, member_client, owner, _, project_id = _setup_shared_project(app)

    create_action = member_client.post(
        f"/projects/{project_id}/actions",
        json={
            "name": "Draft kickoff notes",
            "description": "Initial draft",
            "tags": ["planning", "team"],
            "owner_user_id": owner["user_id"],
        },
    )
    assert create_action.status_code == 201
    action = create_action.json()
    assert action["action_status"] == "PotentialActionStatus"

    action_id = action["id"]
    initial_last_event_id = action["last_event_id"]
    assert initial_last_event_id is not None

    update_action = member_client.patch(
        f"/projects/{project_id}/actions/{action_id}",
        json={
            "description": "Ready for review",
            "tags": ["planning", "review"],
            "owner_text": "Owner fallback",
        },
    )
    assert update_action.status_code == 200
    assert update_action.json()["description"] == "Ready for review"

    transition = member_client.post(
        f"/projects/{project_id}/actions/{action_id}/transition",
        json={
            "to_status": "ActiveActionStatus",
            "reason": "Work started",
            "expected_last_event_id": initial_last_event_id,
        },
    )
    assert transition.status_code == 200
    transitioned = transition.json()
    assert transitioned["action_status"] == "ActiveActionStatus"

    add_comment = member_client.post(
        f"/projects/{project_id}/actions/{action_id}/comments",
        json={"body": "Started implementation."},
    )
    assert add_comment.status_code == 201

    filtered = owner_client.get(
        f"/projects/{project_id}/actions",
        params={"status": "ActiveActionStatus"},
    )
    assert filtered.status_code == 200
    assert any(row["id"] == action_id for row in filtered.json())

    detail = owner_client.get(f"/projects/{project_id}/actions/{action_id}")
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["comment_count"] == 1
    assert len(detail_payload["comments"]) == 1
    assert len(detail_payload["revisions"]) >= 2

    history = owner_client.get(f"/projects/{project_id}/actions/{action_id}/history")
    assert history.status_code == 200
    history_payload = history.json()
    assert len(history_payload["transitions"]) == 2
    assert len(history_payload["revisions"]) >= 2


def test_transition_rejects_stale_expected_event_id(app):
    owner_client, _, _, _, project_id = _setup_shared_project(app)

    created = owner_client.post(
        f"/projects/{project_id}/actions",
        json={"name": "Prepare report"},
    )
    assert created.status_code == 201
    action = created.json()

    first_transition = owner_client.post(
        f"/projects/{project_id}/actions/{action['id']}/transition",
        json={
            "to_status": "ActiveActionStatus",
            "expected_last_event_id": action["last_event_id"],
        },
    )
    assert first_transition.status_code == 200

    stale_transition = owner_client.post(
        f"/projects/{project_id}/actions/{action['id']}/transition",
        json={
            "to_status": "CompletedActionStatus",
            "expected_last_event_id": action["last_event_id"],
        },
    )
    assert stale_transition.status_code == 409
    assert stale_transition.json()["detail"]["code"] == "STALE_TRANSITION"


def test_non_project_member_cannot_access_project_actions(app):
    owner_client = TestClient(app)
    outsider_client = TestClient(app)

    owner = _register_and_login(owner_client)
    outsider = _register_and_login(outsider_client)

    project_id = _create_project(owner_client)

    add_to_org_only = owner_client.post(
        f"/orgs/{owner['org_id']}/members",
        json={"email": outsider["email"], "role": "member"},
    )
    assert add_to_org_only.status_code == 201

    outsider_client.headers.update({"X-Org-Id": owner["org_id"]})
    forbidden = outsider_client.get(f"/projects/{project_id}/actions")
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"] == "Project access denied"


def test_org_owner_can_lookup_member_by_user_id(app):
    owner_client = TestClient(app)
    member_client = TestClient(app)

    owner = _register_and_login(owner_client)
    member = _register_and_login(member_client)

    add_member = owner_client.post(
        f"/orgs/{owner['org_id']}/members",
        json={"email": member["email"], "role": "member"},
    )
    assert add_member.status_code == 201

    lookup = owner_client.get(f"/orgs/{owner['org_id']}/members/{member['user_id']}")
    assert lookup.status_code == 200

    payload = lookup.json()
    assert payload["org_id"] == owner["org_id"]
    assert payload["user_id"] == member["user_id"]
    assert payload["email"] == member["email"]
    assert payload["role"] == "member"
    assert payload["status"] == "active"


def test_org_member_cannot_lookup_member_by_user_id(app):
    owner_client = TestClient(app)
    member_client = TestClient(app)

    owner = _register_and_login(owner_client)
    member = _register_and_login(member_client)

    add_member = owner_client.post(
        f"/orgs/{owner['org_id']}/members",
        json={"email": member["email"], "role": "member"},
    )
    assert add_member.status_code == 201

    member_client.headers.update({"X-Org-Id": owner["org_id"]})
    forbidden = member_client.get(f"/orgs/{owner['org_id']}/members/{owner['user_id']}")
    assert forbidden.status_code == 403
    assert forbidden.json()["detail"] == "Insufficient role"
