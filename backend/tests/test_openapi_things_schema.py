def test_openapi_things_uses_typed_oneof_models(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    spec = response.json()
    schemas = spec["components"]["schemas"]

    create_thing = schemas["ThingCreateRequest"]["properties"]["thing"]
    assert len(create_thing["oneOf"]) == 4
    assert create_thing["discriminator"]["propertyName"] == "@type"

    response_thing = schemas["ThingResponse"]["properties"]["thing"]
    assert len(response_thing["oneOf"]) == 4
    assert response_thing["discriminator"]["propertyName"] == "@type"

    action_output = schemas["ActionThingJsonLd-Output"]["properties"]
    assert "@type" in action_output
    assert "sourceMetadata" in action_output
    assert "bucket" in action_output
