"""Unit tests for chat instrumentation (spans, metrics, structured logs).

Pure logic tests — no DB, no network, no file I/O.
"""

from __future__ import annotations

import httpx
import pytest

from app.chat.instrumentation import (
    CHAT_OPENCLAW_ENSURE_RUNNING_TOTAL,
    CHAT_PERSISTENCE_TOTAL,
    CHAT_REQUESTS_TOTAL,
    ChatContext,
    FirstTokenTracker,
    build_error_event,
    classify_error,
    record_persistence_outcome,
    span_chat_completions,
    span_db_setup,
    span_ensure_running,
    span_openclaw_exec,
    span_openrouter_request,
    span_persist_history,
    span_persist_openclaw_memory,
)


def _make_ctx(**overrides) -> ChatContext:
    defaults = {
        "conversation_id": "conv-test-123",
        "request_id": "req-test-456",
        "user_id": "user-test-789",
        "org_id": "org-test-abc",
        "agent_backend": "haystack",
    }
    defaults.update(overrides)
    return ChatContext(**defaults)


# ---------------------------------------------------------------------------
# ChatContext
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestChatContext:
    def test_has_required_fields(self):
        ctx = _make_ctx()
        assert ctx.conversation_id == "conv-test-123"
        assert ctx.agent_backend == "haystack"
        assert ctx.model is None

    def test_optional_model(self):
        ctx = _make_ctx(model="gpt-4o")
        assert ctx.model == "gpt-4o"


# ---------------------------------------------------------------------------
# classify_error
# ---------------------------------------------------------------------------

_DUMMY_REQUEST = httpx.Request("POST", "http://test/chat")


@pytest.mark.unit
class TestClassifyError:
    def test_timeout_haystack(self):
        assert classify_error(httpx.TimeoutException("t"), "haystack") == "provider_timeout"

    def test_timeout_openclaw(self):
        assert classify_error(httpx.TimeoutException("t"), "openclaw") == "container_timeout"

    def test_connect_error_haystack(self):
        assert classify_error(httpx.ConnectError("c"), "haystack") == "provider_unreachable"

    def test_connect_error_openclaw(self):
        assert classify_error(httpx.ConnectError("c"), "openclaw") == "container_unreachable"

    def test_http_500_haystack(self):
        resp = httpx.Response(500, request=_DUMMY_REQUEST)
        exc = httpx.HTTPStatusError("500", request=_DUMMY_REQUEST, response=resp)
        assert classify_error(exc, "haystack") == "provider_error"

    def test_http_500_openclaw(self):
        resp = httpx.Response(500, request=_DUMMY_REQUEST)
        exc = httpx.HTTPStatusError("500", request=_DUMMY_REQUEST, response=resp)
        assert classify_error(exc, "openclaw") == "container_error"

    def test_http_422(self):
        resp = httpx.Response(422, request=_DUMMY_REQUEST)
        exc = httpx.HTTPStatusError("422", request=_DUMMY_REQUEST, response=resp)
        assert classify_error(exc, "haystack") == "client_error"

    def test_generic_exception(self):
        assert classify_error(RuntimeError("oops"), "haystack") == "backend_error"


# ---------------------------------------------------------------------------
# build_error_event
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestBuildErrorEvent:
    def test_includes_request_id_and_error_type(self):
        ctx = _make_ctx(agent_backend="haystack")
        exc = httpx.TimeoutException("timed out")
        event = build_error_event("Agents service timeout", ctx=ctx, exc=exc)
        assert event["type"] == "error"
        assert event["detail"] == "Agents service timeout"
        assert event["requestId"] == "req-test-456"
        assert event["errorType"] == "provider_timeout"

    def test_without_exception_defaults_to_backend_error(self):
        ctx = _make_ctx()
        event = build_error_event("Something went wrong", ctx=ctx)
        assert event["errorType"] == "backend_error"
        assert event["requestId"] == "req-test-456"

    def test_none_request_id(self):
        ctx = _make_ctx(request_id=None)
        event = build_error_event("fail", ctx=ctx)
        assert event["requestId"] is None

    def test_without_ctx(self):
        event = build_error_event("no context")
        assert event == {"type": "error", "detail": "no context"}
        assert "requestId" not in event
        assert "errorType" not in event

    def test_openclaw_timeout(self):
        ctx = _make_ctx(agent_backend="openclaw")
        exc = httpx.TimeoutException("timed out")
        event = build_error_event("OpenClaw timeout", ctx=ctx, exc=exc)
        assert event["errorType"] == "container_timeout"

    def test_connect_error(self):
        ctx = _make_ctx(agent_backend="haystack")
        exc = httpx.ConnectError("refused")
        event = build_error_event("Agents unreachable", ctx=ctx, exc=exc)
        assert event["errorType"] == "provider_unreachable"


# ---------------------------------------------------------------------------
# FirstTokenTracker
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestFirstTokenTracker:
    def test_records_only_once(self):
        tracker = FirstTokenTracker("haystack")
        tracker.mark_first_token()
        assert tracker._recorded is True
        # second call is a no-op
        tracker.mark_first_token()
        assert tracker._recorded is True


# ---------------------------------------------------------------------------
# record_persistence_outcome
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestRecordPersistenceOutcome:
    def test_success_increments_counter(self):
        ctx = _make_ctx()
        before = CHAT_PERSISTENCE_TOTAL.labels(target="history", outcome="success")._value.get()
        record_persistence_outcome("history", True, ctx)
        after = CHAT_PERSISTENCE_TOTAL.labels(target="history", outcome="success")._value.get()
        assert after == before + 1

    def test_failure_increments_failure_counter(self):
        ctx = _make_ctx()
        before = CHAT_PERSISTENCE_TOTAL.labels(target="history", outcome="failure")._value.get()
        record_persistence_outcome("history", False, ctx, error=RuntimeError("db down"))
        after = CHAT_PERSISTENCE_TOTAL.labels(target="history", outcome="failure")._value.get()
        assert after == before + 1

    def test_openclaw_memory_target(self):
        ctx = _make_ctx(agent_backend="openclaw")
        before = CHAT_PERSISTENCE_TOTAL.labels(
            target="openclaw_memory", outcome="success"
        )._value.get()
        record_persistence_outcome("openclaw_memory", True, ctx)
        after = CHAT_PERSISTENCE_TOTAL.labels(
            target="openclaw_memory", outcome="success"
        )._value.get()
        assert after == before + 1


# ---------------------------------------------------------------------------
# Span context managers (metric side-effects)
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestSpanChatCompletions:
    def test_increments_request_counter_on_success(self):
        ctx = _make_ctx()
        before = CHAT_REQUESTS_TOTAL.labels(backend="haystack", status="success")._value.get()
        with span_chat_completions(ctx):
            pass
        after = CHAT_REQUESTS_TOTAL.labels(backend="haystack", status="success")._value.get()
        assert after == before + 1

    def test_increments_error_counter_on_exception(self):
        ctx = _make_ctx()
        before = CHAT_REQUESTS_TOTAL.labels(backend="haystack", status="error")._value.get()
        with pytest.raises(ValueError):
            with span_chat_completions(ctx):
                raise ValueError("test error")
        after = CHAT_REQUESTS_TOTAL.labels(backend="haystack", status="error")._value.get()
        assert after == before + 1


@pytest.mark.unit
class TestSpanDbSetup:
    def test_does_not_raise_on_success(self):
        ctx = _make_ctx()
        with span_db_setup(ctx):
            pass  # no error

    def test_propagates_exception(self):
        ctx = _make_ctx()
        with pytest.raises(RuntimeError, match="db fail"):
            with span_db_setup(ctx):
                raise RuntimeError("db fail")


@pytest.mark.unit
class TestSpanEnsureRunning:
    def test_increments_success_counter(self):
        ctx = _make_ctx(agent_backend="openclaw")
        before = CHAT_OPENCLAW_ENSURE_RUNNING_TOTAL.labels(outcome="success")._value.get()
        with span_ensure_running(ctx):
            pass
        after = CHAT_OPENCLAW_ENSURE_RUNNING_TOTAL.labels(outcome="success")._value.get()
        assert after == before + 1

    def test_increments_failure_counter_on_exception(self):
        ctx = _make_ctx(agent_backend="openclaw")
        before = CHAT_OPENCLAW_ENSURE_RUNNING_TOTAL.labels(outcome="failure")._value.get()
        with pytest.raises(RuntimeError):
            with span_ensure_running(ctx):
                raise RuntimeError("container down")
        after = CHAT_OPENCLAW_ENSURE_RUNNING_TOTAL.labels(outcome="failure")._value.get()
        assert after == before + 1


# ---------------------------------------------------------------------------
# New span context managers (issue #98 phase 4)
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestSpanOpenrouterRequest:
    def test_does_not_raise_on_success(self):
        ctx = _make_ctx()
        with span_openrouter_request(ctx):
            pass

    def test_propagates_exception(self):
        ctx = _make_ctx()
        with pytest.raises(RuntimeError, match="provider fail"):
            with span_openrouter_request(ctx):
                raise RuntimeError("provider fail")


@pytest.mark.unit
class TestSpanOpenclawExec:
    def test_creates_context_manager(self):
        """span_openclaw_exec returns an async context manager."""
        ctx = _make_ctx(agent_backend="openclaw")
        acm = span_openclaw_exec(ctx)
        assert hasattr(acm, "__aenter__")
        assert hasattr(acm, "__aexit__")


@pytest.mark.unit
class TestSpanPersistHistory:
    def test_does_not_raise_on_success(self):
        ctx = _make_ctx()
        with span_persist_history(ctx):
            pass

    def test_propagates_exception(self):
        ctx = _make_ctx()
        with pytest.raises(RuntimeError, match="db fail"):
            with span_persist_history(ctx):
                raise RuntimeError("db fail")


@pytest.mark.unit
class TestSpanParenting:
    """Verify that span context managers produce a proper parent-child tree."""

    @pytest.fixture(autouse=True)
    def _tracing(self, monkeypatch):
        """Set up an in-memory tracing provider for each test."""
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import (
            SimpleSpanProcessor,
            SpanExporter,
            SpanExportResult,
        )

        self.collected: list = []
        exporter_ref = self

        class _InMemoryExporter(SpanExporter):
            def export(self, spans):
                exporter_ref.collected.extend(spans)
                return SpanExportResult.SUCCESS

            def shutdown(self):
                pass

        provider = TracerProvider()
        provider.add_span_processor(SimpleSpanProcessor(_InMemoryExporter()))
        tracer = provider.get_tracer("chat", "0.1.0")

        monkeypatch.setattr(
            "app.chat.instrumentation._get_tracer", lambda: tracer
        )
        yield
        provider.shutdown()

    def test_nested_spans_share_trace_id(self):
        """span_db_setup and span_ensure_running inside span_chat_completions
        must share the same trace_id and be children of the parent."""
        ctx = _make_ctx()
        with span_chat_completions(ctx):
            with span_db_setup(ctx):
                pass
            with span_ensure_running(ctx):
                pass

        spans = self.collected
        assert len(spans) == 3

        trace_ids = {s.context.trace_id for s in spans}
        assert len(trace_ids) == 1, f"Expected 1 trace, got {len(trace_ids)}"

        by_name = {s.name: s for s in spans}
        parent = by_name["backend.chat.completions"]
        db = by_name["backend.chat.db_setup"]
        ensure = by_name["backend.openclaw.ensure_running"]

        assert db.parent is not None
        assert db.parent.span_id == parent.context.span_id
        assert ensure.parent is not None
        assert ensure.parent.span_id == parent.context.span_id

    def test_deeply_nested_spans(self):
        """Spans nested three levels deep should form a proper chain."""
        ctx = _make_ctx()
        with span_chat_completions(ctx):
            with span_db_setup(ctx):
                with span_persist_history(ctx):
                    pass

        spans = self.collected
        assert len(spans) == 3

        trace_ids = {s.context.trace_id for s in spans}
        assert len(trace_ids) == 1

        by_name = {s.name: s for s in spans}
        root = by_name["backend.chat.completions"]
        mid = by_name["backend.chat.db_setup"]
        leaf = by_name["backend.persistence.write_history"]

        assert mid.parent.span_id == root.context.span_id
        assert leaf.parent.span_id == mid.context.span_id

    def test_graceful_without_otel(self, monkeypatch):
        """When OTel tracer is unavailable, span functions yield None."""
        monkeypatch.setattr(
            "app.chat.instrumentation._get_tracer", lambda: None
        )
        ctx = _make_ctx()
        with span_chat_completions(ctx) as s:
            assert s is None
            with span_db_setup(ctx) as s2:
                assert s2 is None


@pytest.mark.unit
class TestSpanPersistOpenclawMemory:
    def test_does_not_raise_on_success(self):
        ctx = _make_ctx(agent_backend="openclaw")
        with span_persist_openclaw_memory(ctx):
            pass

    def test_propagates_exception(self):
        ctx = _make_ctx(agent_backend="openclaw")
        with pytest.raises(RuntimeError, match="sync fail"):
            with span_persist_openclaw_memory(ctx):
                raise RuntimeError("sync fail")
