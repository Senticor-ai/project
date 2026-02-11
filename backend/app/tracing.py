"""OpenTelemetry tracing initialisation for the FastAPI backend.

Reads standard OTEL env vars (``OTEL_SERVICE_NAME``,
``OTEL_EXPORTER_OTLP_ENDPOINT``, ``OTEL_RESOURCE_ATTRIBUTES``, etc.)
that are already configured in the K8s configmaps.  When the endpoint
env var is absent (e.g. local dev without a collector) tracing is
silently disabled — no crash, just a log line.
"""

from __future__ import annotations

import os

from fastapi import FastAPI

from .observability import get_logger

logger = get_logger("tracing")


def configure_tracing(app: FastAPI) -> object | None:
    """Initialise OTEL tracing and instrument *app*.

    Returns the ``TracerProvider`` so the caller can shut it down
    during app shutdown, or ``None`` when tracing is disabled.
    """
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        logger.info("tracing.disabled", reason="OTEL_EXPORTER_OTLP_ENDPOINT not set")
        return None

    # Import lazily so the app starts even if otel packages are missing.
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    # The SDK auto-reads OTEL_SERVICE_NAME, OTEL_RESOURCE_ATTRIBUTES, etc.
    provider = TracerProvider()
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))

    # Set as the global provider so manual spans elsewhere pick it up.
    from opentelemetry import trace

    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)
    logger.info("tracing.enabled", endpoint=endpoint)
    return provider


def shutdown_tracing(provider: object | None) -> None:
    """Flush pending spans and shut down the tracer provider."""
    if provider is None:
        return

    from opentelemetry.sdk.trace import TracerProvider

    if isinstance(provider, TracerProvider):
        provider.shutdown()
        logger.info("tracing.shutdown")
