import json
import logging
import os
import sys
import types

from fastapi import FastAPI

from app import tracing


def _package(name: str) -> types.ModuleType:
    module = types.ModuleType(name)
    module.__path__ = []  # type: ignore[attr-defined]
    return module


def _parse_structured_events(caplog) -> list[dict]:
    events: list[dict] = []
    for record in caplog.records:
        message = record.getMessage()
        try:
            payload = json.loads(message)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            events.append(payload)
    return events


def _install_mocked_otel(monkeypatch):
    class FakeOTLPSpanExporter:
        def __init__(self):
            self.endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")

    class FakeBatchSpanProcessor:
        def __init__(self, exporter):
            self.exporter = exporter

    class FakeTracerProvider:
        def __init__(self):
            self.span_processors: list[FakeBatchSpanProcessor] = []
            self.shutdown_called = False

        def add_span_processor(self, span_processor):
            self.span_processors.append(span_processor)

        def shutdown(self):
            self.shutdown_called = True

    class FakeFastAPIInstrumentor:
        instrumented_apps: list[FastAPI] = []

        @classmethod
        def instrument_app(cls, app: FastAPI):
            cls.instrumented_apps.append(app)

    class FakeHTTPXClientInstrumentor:
        instrument_called = False

        def instrument(self):
            type(self).instrument_called = True

    opentelemetry_module = _package("opentelemetry")
    exporter_module = _package("opentelemetry.exporter")
    otlp_module = _package("opentelemetry.exporter.otlp")
    proto_module = _package("opentelemetry.exporter.otlp.proto")
    http_module = _package("opentelemetry.exporter.otlp.proto.http")
    instrumentation_module = _package("opentelemetry.instrumentation")
    sdk_module = _package("opentelemetry.sdk")

    trace_module = types.ModuleType("opentelemetry.trace")
    trace_module.provider = None

    def _set_tracer_provider(provider):
        trace_module.provider = provider

    trace_module.set_tracer_provider = _set_tracer_provider

    trace_exporter_module = types.ModuleType(
        "opentelemetry.exporter.otlp.proto.http.trace_exporter"
    )
    trace_exporter_module.OTLPSpanExporter = FakeOTLPSpanExporter

    fastapi_instrumentor_module = types.ModuleType("opentelemetry.instrumentation.fastapi")
    fastapi_instrumentor_module.FastAPIInstrumentor = FakeFastAPIInstrumentor

    httpx_instrumentor_module = types.ModuleType("opentelemetry.instrumentation.httpx")
    httpx_instrumentor_module.HTTPXClientInstrumentor = FakeHTTPXClientInstrumentor

    sdk_trace_module = types.ModuleType("opentelemetry.sdk.trace")
    sdk_trace_module.TracerProvider = FakeTracerProvider

    sdk_trace_export_module = types.ModuleType("opentelemetry.sdk.trace.export")
    sdk_trace_export_module.BatchSpanProcessor = FakeBatchSpanProcessor

    opentelemetry_module.trace = trace_module
    opentelemetry_module.exporter = exporter_module
    opentelemetry_module.instrumentation = instrumentation_module
    opentelemetry_module.sdk = sdk_module

    exporter_module.otlp = otlp_module
    otlp_module.proto = proto_module
    proto_module.http = http_module
    http_module.trace_exporter = trace_exporter_module

    instrumentation_module.fastapi = fastapi_instrumentor_module
    instrumentation_module.httpx = httpx_instrumentor_module

    sdk_module.trace = sdk_trace_module
    sdk_trace_module.export = sdk_trace_export_module

    monkeypatch.setitem(sys.modules, "opentelemetry", opentelemetry_module)
    monkeypatch.setitem(sys.modules, "opentelemetry.trace", trace_module)
    monkeypatch.setitem(sys.modules, "opentelemetry.exporter", exporter_module)
    monkeypatch.setitem(sys.modules, "opentelemetry.exporter.otlp", otlp_module)
    monkeypatch.setitem(sys.modules, "opentelemetry.exporter.otlp.proto", proto_module)
    monkeypatch.setitem(sys.modules, "opentelemetry.exporter.otlp.proto.http", http_module)
    monkeypatch.setitem(
        sys.modules,
        "opentelemetry.exporter.otlp.proto.http.trace_exporter",
        trace_exporter_module,
    )
    monkeypatch.setitem(
        sys.modules,
        "opentelemetry.instrumentation",
        instrumentation_module,
    )
    monkeypatch.setitem(
        sys.modules,
        "opentelemetry.instrumentation.fastapi",
        fastapi_instrumentor_module,
    )
    monkeypatch.setitem(
        sys.modules,
        "opentelemetry.instrumentation.httpx",
        httpx_instrumentor_module,
    )
    monkeypatch.setitem(sys.modules, "opentelemetry.sdk", sdk_module)
    monkeypatch.setitem(sys.modules, "opentelemetry.sdk.trace", sdk_trace_module)
    monkeypatch.setitem(
        sys.modules,
        "opentelemetry.sdk.trace.export",
        sdk_trace_export_module,
    )

    return {
        "trace_module": trace_module,
        "FakeTracerProvider": FakeTracerProvider,
        "FakeBatchSpanProcessor": FakeBatchSpanProcessor,
        "FakeFastAPIInstrumentor": FakeFastAPIInstrumentor,
        "FakeHTTPXClientInstrumentor": FakeHTTPXClientInstrumentor,
    }


def test_health_request_emits_structured_log_and_correlation_headers(client, caplog):
    caplog.set_level(logging.INFO)
    caplog.clear()

    response = client.get(
        "/health",
        headers={"X-Request-ID": "req-health-1", "X-Trail-ID": "trail-health-1"},
    )

    assert response.status_code == 200
    assert response.headers.get("X-Request-ID") == "req-health-1"
    assert response.headers.get("X-Trail-ID") == "trail-health-1"

    events = _parse_structured_events(caplog)
    request_logs = [
        event
        for event in events
        if event.get("event") == "request.completed" and event.get("path") == "/health"
    ]
    assert request_logs
    request_log = request_logs[-1]
    assert request_log.get("request_id") == "req-health-1"
    assert request_log.get("trail_id") == "trail-health-1"
    assert request_log.get("method") == "GET"
    assert request_log.get("route") == "/health"
    assert request_log.get("status_code") == 200
    assert isinstance(request_log.get("duration_ms"), int)
    assert request_log.get("handler")


def test_metrics_request_emits_structured_logs_and_db_trail_correlation(client, caplog):
    caplog.set_level(logging.INFO)
    caplog.clear()

    response = client.get(
        "/metrics",
        headers={"X-Request-ID": "req-metrics-1", "X-Trail-ID": "trail-metrics-1"},
    )

    assert response.status_code == 200
    assert "http_server_requests_total" in response.text

    events = _parse_structured_events(caplog)
    request_logs = [
        event
        for event in events
        if event.get("event") == "request.completed" and event.get("path") == "/metrics"
    ]
    assert request_logs
    request_log = request_logs[-1]
    assert request_log.get("request_id") == "req-metrics-1"
    assert request_log.get("trail_id") == "trail-metrics-1"
    assert request_log.get("method") == "GET"
    assert request_log.get("route") == "/metrics"
    assert request_log.get("status_code") == 200
    assert isinstance(request_log.get("duration_ms"), int)

    db_logs = [
        event for event in events if event.get("event") in {"db.query", "db.executemany"}
    ]
    assert any(event.get("trail_id") == "trail-metrics-1" for event in db_logs)


def test_authenticated_errors_include_user_uuid_in_logs_and_metrics(auth_client, caplog):
    caplog.set_level(logging.INFO)
    caplog.clear()

    missing_item_id = "00000000-0000-0000-0000-000000000000"
    response = auth_client.get(f"/items/{missing_item_id}")
    assert response.status_code == 404

    events = _parse_structured_events(caplog)
    request_logs = [
        event
        for event in events
        if event.get("event") == "request.completed"
        and event.get("path") == f"/items/{missing_item_id}"
    ]
    assert request_logs
    request_log = request_logs[-1]

    user_id_anon = request_log.get("user_id_anon")
    assert user_id_anon
    assert user_id_anon != request_log.get("user_id")
    assert request_log.get("session_id")
    assert request_log.get("status_code") == 404
    assert request_log.get("error_reason") == "Item not found"

    metrics_response = auth_client.get("/metrics")
    assert metrics_response.status_code == 200
    assert (
        'http_server_errors_by_user_total{method="GET",route="/items/{item_id}",'
        f'status_code="404",user_id_anon="{user_id_anon}"}} 1.0'
    ) in metrics_response.text


def test_not_found_request_logs_error_reason(client, caplog):
    caplog.set_level(logging.INFO)
    caplog.clear()

    response = client.get("/missing-observability-route")

    assert response.status_code == 404

    events = _parse_structured_events(caplog)
    request_logs = [
        event
        for event in events
        if event.get("event") == "request.completed"
        and event.get("path") == "/missing-observability-route"
    ]
    assert request_logs
    request_log = request_logs[-1]
    assert request_log.get("status_code") == 404
    assert request_log.get("error_reason") == "Not Found"


def test_tracing_configure_and_shutdown_with_mocked_otel_and_alloy(monkeypatch):
    mocked = _install_mocked_otel(monkeypatch)
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "http://alloy.mock:4318")

    app = FastAPI()
    provider = tracing.configure_tracing(app)

    assert isinstance(provider, mocked["FakeTracerProvider"])
    assert len(provider.span_processors) == 1

    processor = provider.span_processors[0]
    assert isinstance(processor, mocked["FakeBatchSpanProcessor"])
    assert processor.exporter.endpoint == "http://alloy.mock:4318"

    assert mocked["FakeFastAPIInstrumentor"].instrumented_apps == [app]
    assert mocked["FakeHTTPXClientInstrumentor"].instrument_called is True
    assert mocked["trace_module"].provider is provider

    tracing.shutdown_tracing(provider)
    assert provider.shutdown_called is True
