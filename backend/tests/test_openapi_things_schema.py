def test_openapi_things_uses_typed_oneof_models(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    spec = response.json()
    schemas = spec["components"]["schemas"]

    # ThingCreateRequest.thing — 4 oneOf variants (Action, Project, CreativeWork, Event)
    create_thing = schemas["ThingCreateRequest"]["properties"]["thing"]
    assert len(create_thing["oneOf"]) == 4

    # ThingResponse.thing — same 4 variants
    response_thing = schemas["ThingResponse"]["properties"]["thing"]
    assert len(response_thing["oneOf"]) == 4

    # ActionThingJsonLd has action-specific schema.org properties
    action_name = (
        "ActionThingJsonLd-Output" if "ActionThingJsonLd-Output" in schemas else "ActionThingJsonLd"
    )
    action_output = schemas[action_name]["properties"]
    assert "@type" in action_output
    assert "sourceMetadata" in action_output
    assert "additionalProperty" in action_output
    assert "startTime" in action_output
    assert "endTime" in action_output

    # EventThingJsonLd has event-specific schema.org properties
    event_name = (
        "EventThingJsonLd-Output" if "EventThingJsonLd-Output" in schemas else "EventThingJsonLd"
    )
    event_output = schemas[event_name]["properties"]
    assert "@type" in event_output
    assert "startDate" in event_output
    assert "endDate" in event_output
    assert "duration" in event_output
    assert "location" in event_output

    # ThingPatchRequest has name_source for rename provenance
    patch_req = schemas["ThingPatchRequest"]["properties"]
    assert "name_source" in patch_req
    assert "source" in patch_req
    assert "thing" in patch_req
