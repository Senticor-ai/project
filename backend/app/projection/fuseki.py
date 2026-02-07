import json
from urllib.parse import quote
from urllib.request import Request, urlopen

from ..config import settings
from ..observability import request_context_headers


def is_enabled() -> bool:
    return settings.fuseki_enabled


def _graph_store_url() -> str:
    dataset = settings.fuseki_dataset.strip("/")
    graph = quote(settings.fuseki_graph, safe="")
    return f"{settings.fuseki_url.rstrip('/')}/{dataset}/data?graph={graph}"


def upsert_jsonld(payload: dict) -> None:
    url = _graph_store_url()
    body = json.dumps(payload).encode("utf-8")
    request = Request(url, data=body, method="PUT")
    request.add_header("Content-Type", "application/ld+json")
    for key, value in request_context_headers().items():
        request.add_header(key, value)

    if settings.fuseki_username and settings.fuseki_password:
        import base64

        token = f"{settings.fuseki_username}:{settings.fuseki_password}".encode()
        encoded = base64.b64encode(token).decode("utf-8")
        request.add_header("Authorization", f"Basic {encoded}")

    with urlopen(request, timeout=10) as response:  # nosec B310
        if response.status >= 400:
            raise RuntimeError(f"Fuseki upsert failed: {response.status}")
