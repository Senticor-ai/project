"""Tests for the `completed` query parameter on GET /things/sync."""


def _pv(property_id: str, value: object) -> dict:
    return {"@type": "PropertyValue", "propertyID": property_id, "value": value}


def _create_action(auth_client, *, name: str, bucket: str, end_time: str | None = None):
    thing = {
        "@id": f"urn:app:action:{name.replace(' ', '-').lower()}",
        "@type": "Action",
        "name": name,
        "endTime": end_time,
        "additionalProperty": [
            _pv("app:bucket", bucket),
            _pv("app:isFocused", False),
            _pv("app:contexts", []),
        ],
    }
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _create_inbox(auth_client, *, name: str):
    thing = {
        "@id": f"urn:app:inbox:{name.replace(' ', '-').lower()}",
        "@type": "Action",
        "name": name,
        "startTime": None,
        "endTime": None,
        "additionalProperty": [
            _pv("app:bucket", "inbox"),
            _pv("app:rawCapture", name),
            _pv("app:isFocused", False),
            _pv("app:contexts", []),
        ],
    }
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _create_project(auth_client, *, name: str, end_time: str | None = None):
    thing = {
        "@id": f"urn:app:project:{name.replace(' ', '-').lower()}",
        "@type": "Project",
        "name": name,
        "endTime": end_time,
        "additionalProperty": [
            _pv("app:bucket", "project"),
            _pv("app:projectStatus", "completed" if end_time else "active"),
            _pv("app:isFocused", False),
            _pv("app:desiredOutcome", ""),
            _pv("app:reviewDate", None),
        ],
    }
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _create_reference(auth_client, *, name: str):
    thing = {
        "@id": f"urn:app:reference:{name.replace(' ', '-').lower()}",
        "@type": "CreativeWork",
        "name": name,
        "additionalProperty": [
            _pv("app:bucket", "reference"),
            _pv("app:origin", "captured"),
        ],
    }
    resp = auth_client.post("/things", json={"thing": thing, "source": "manual"})
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def _sync(auth_client, **params) -> dict:
    resp = auth_client.get("/things/sync", params=params)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _canonical_ids(sync_result: dict) -> set[str]:
    return {item["canonical_id"] for item in sync_result["items"]}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_default_sync_excludes_completed(auth_client):
    """Without completed param, sync returns only active items."""
    _create_action(auth_client, name="Active task", bucket="next")
    _create_action(
        auth_client,
        name="Done task",
        bucket="next",
        end_time="2026-01-15T12:00:00Z",
    )

    result = _sync(auth_client)
    ids = _canonical_ids(result)
    assert "urn:app:action:active-task" in ids
    assert "urn:app:action:done-task" not in ids


def test_completed_false_same_as_default(auth_client):
    """completed=false behaves identically to the default."""
    _create_action(auth_client, name="Active one", bucket="next")
    _create_action(
        auth_client,
        name="Done one",
        bucket="next",
        end_time="2026-01-15T12:00:00Z",
    )

    result = _sync(auth_client, completed="false")
    ids = _canonical_ids(result)
    assert "urn:app:action:active-one" in ids
    assert "urn:app:action:done-one" not in ids


def test_completed_true_returns_only_completed(auth_client):
    """completed=true returns only items with endTime set."""
    _create_action(auth_client, name="Active two", bucket="next")
    _create_action(
        auth_client,
        name="Done two",
        bucket="next",
        end_time="2026-01-15T12:00:00Z",
    )

    result = _sync(auth_client, completed="true")
    ids = _canonical_ids(result)
    assert "urn:app:action:done-two" in ids
    assert "urn:app:action:active-two" not in ids


def test_completed_all_returns_everything(auth_client):
    """completed=all returns both active and completed items."""
    _create_action(auth_client, name="Active all", bucket="next")
    _create_action(
        auth_client,
        name="Done all",
        bucket="next",
        end_time="2026-01-15T12:00:00Z",
    )

    result = _sync(auth_client, completed="all")
    ids = _canonical_ids(result)
    assert "urn:app:action:active-all" in ids
    assert "urn:app:action:done-all" in ids


def test_inbox_items_always_appear_with_completed_false(auth_client):
    """Inbox Things (no endTime) should always be returned."""
    _create_inbox(auth_client, name="Capture idea")

    result = _sync(auth_client, completed="false")
    ids = _canonical_ids(result)
    assert "urn:app:inbox:capture-idea" in ids


def test_references_always_appear_with_completed_false(auth_client):
    """References (CreativeWork, no endTime) should always be returned."""
    _create_reference(auth_client, name="Ref doc")

    result = _sync(auth_client, completed="false")
    ids = _canonical_ids(result)
    assert "urn:app:reference:ref-doc" in ids


def test_completed_projects_excluded_by_default(auth_client):
    """Projects with endTime should be excluded by completed=false."""
    _create_project(auth_client, name="Active proj")
    _create_project(
        auth_client,
        name="Done proj",
        end_time="2026-01-15T12:00:00Z",
    )

    result = _sync(auth_client, completed="false")
    ids = _canonical_ids(result)
    assert "urn:app:project:active-proj" in ids
    assert "urn:app:project:done-proj" not in ids


def test_completed_projects_returned_with_completed_true(auth_client):
    """completed=true should return completed projects."""
    _create_project(
        auth_client,
        name="Done proj two",
        end_time="2026-01-15T12:00:00Z",
    )

    result = _sync(auth_client, completed="true")
    ids = _canonical_ids(result)
    assert "urn:app:project:done-proj-two" in ids


def test_invalid_completed_returns_400(auth_client):
    """Invalid completed value should return 400."""
    resp = auth_client.get("/things/sync", params={"completed": "maybe"})
    assert resp.status_code == 400


def test_cursor_pagination_respects_completed_filter(auth_client):
    """Cursor-based pagination should work with the completed filter."""
    # Create 3 active and 2 completed
    for i in range(3):
        _create_action(auth_client, name=f"Pag active {i}", bucket="next")
    for i in range(2):
        _create_action(
            auth_client,
            name=f"Pag done {i}",
            bucket="next",
            end_time="2026-01-15T12:00:00Z",
        )

    # Fetch active items with small pages
    page1 = _sync(auth_client, completed="false", limit=2)
    assert len(page1["items"]) == 2
    assert page1["has_more"] is True

    page2 = _sync(auth_client, completed="false", limit=2, cursor=page1["next_cursor"])
    # Should get remaining active item(s)
    all_ids = _canonical_ids(page1) | _canonical_ids(page2)
    for i in range(3):
        assert f"urn:app:action:pag-active-{i}" in all_ids
    for i in range(2):
        assert f"urn:app:action:pag-done-{i}" not in all_ids


def test_etag_differs_for_different_completed_values(auth_client):
    """ETags should differ between completed=false and completed=true."""
    _create_action(auth_client, name="Etag active", bucket="next")
    _create_action(
        auth_client,
        name="Etag done",
        bucket="next",
        end_time="2026-01-15T12:00:00Z",
    )

    resp_false = auth_client.get("/things/sync", params={"completed": "false"})
    resp_true = auth_client.get("/things/sync", params={"completed": "true"})
    assert resp_false.status_code == 200
    assert resp_true.status_code == 200
    assert resp_false.headers.get("etag") != resp_true.headers.get("etag")
