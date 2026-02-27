from app.config import settings


def _parameter_ref_id(header_name: str) -> str:
    token_chars: list[str] = []
    for char in header_name:
        if char.isalnum():
            token_chars.append(char.lower())
            continue
        if token_chars and token_chars[-1] != "_":
            token_chars.append("_")
    token = "".join(token_chars).strip("_")
    if not token:
        token = "header"
    return f"{token}_header"


def test_openapi_uses_safe_header_parameter_refs(client):
    response = client.get("/openapi.json")
    assert response.status_code == 200
    spec = response.json()
    parameters = spec["components"]["parameters"]

    request_id_ref = _parameter_ref_id("X-Request-ID")
    csrf_ref = _parameter_ref_id(settings.csrf_header_name)

    assert request_id_ref in parameters
    assert parameters[request_id_ref]["name"] == "X-Request-ID"
    assert "X-Request-ID" not in parameters

    assert csrf_ref in parameters
    assert parameters[csrf_ref]["name"] == settings.csrf_header_name

    for path_item in spec["paths"].values():
        for method, operation in path_item.items():
            if method not in {
                "get",
                "post",
                "put",
                "delete",
                "patch",
                "options",
                "head",
                "trace",
            }:
                continue
            for param in operation.get("parameters", []):
                if "$ref" not in param:
                    continue
                ref = param["$ref"]
                assert not ref.endswith("/X-Request-ID")
                assert not ref.endswith(f"/{settings.csrf_header_name}")
