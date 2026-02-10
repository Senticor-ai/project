def test_openapi_items_uses_typed_oneof_models(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    spec = response.json()
    schemas = spec["components"]["schemas"]

    # ItemCreateRequest.item — 4 oneOf variants (Action, Project, CreativeWork, Event)
    create_item = schemas["ItemCreateRequest"]["properties"]["item"]
    assert len(create_item["oneOf"]) == 4

    # ItemResponse.item — same 4 variants
    response_item = schemas["ItemResponse"]["properties"]["item"]
    assert len(response_item["oneOf"]) == 4

    # ActionItemJsonLd has action-specific schema.org properties
    action_name = (
        "ActionItemJsonLd-Output" if "ActionItemJsonLd-Output" in schemas else "ActionItemJsonLd"
    )
    action_output = schemas[action_name]["properties"]
    assert "@type" in action_output
    assert "sourceMetadata" in action_output
    assert "additionalProperty" in action_output
    assert "startTime" in action_output
    assert "endTime" in action_output

    # EventItemJsonLd has event-specific schema.org properties
    event_name = (
        "EventItemJsonLd-Output" if "EventItemJsonLd-Output" in schemas else "EventItemJsonLd"
    )
    event_output = schemas[event_name]["properties"]
    assert "@type" in event_output
    assert "startDate" in event_output
    assert "endDate" in event_output
    assert "duration" in event_output
    assert "location" in event_output

    # ItemPatchRequest has name_source for rename provenance
    patch_req = schemas["ItemPatchRequest"]["properties"]
    assert "name_source" in patch_req
    assert "source" in patch_req
    assert "item" in patch_req
