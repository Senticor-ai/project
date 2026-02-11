"""OpenTelemetry tracing for the agents service.

Reads standard OTEL env vars (OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT,
etc.). When the endpoint env var is absent (local dev) tracing is silently
disabled. Mirrors the backend's tracing.py pattern.
"""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI

logger = logging.getLogger("tracing")


def configure_tracing(app: FastAPI) -> object | None:
    """Initialise OTEL tracing and instrument *app*.

    Returns the TracerProvider so the caller can shut it down
    during app shutdown, or None when tracing is disabled.
    """
    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        logger.info("Tracing disabled: OTEL_EXPORTER_OTLP_ENDPOINT not set")
        return None

    # Import lazily so the app starts even if otel packages are missing.
    from opentelemetry import trace
    from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor

    provider = TracerProvider()
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
    trace.set_tracer_provider(provider)

    FastAPIInstrumentor.instrument_app(app)

    # Instrument httpx to propagate W3C Trace Context (traceparent) to backend
    try:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        HTTPXClientInstrumentor().instrument()
        logger.info("Tracing: httpx instrumented")
    except ImportError:
        logger.info("Tracing: httpx instrumentation skipped (package not installed)")

    logger.info("Tracing enabled: endpoint=%s", endpoint)
    return provider


def shutdown_tracing(provider: object | None) -> None:
    """Flush pending spans and shut down the tracer provider."""
    if provider is None:
        return

    from opentelemetry.sdk.trace import TracerProvider

    if isinstance(provider, TracerProvider):
        provider.shutdown()
        logger.info("Tracing shutdown")
