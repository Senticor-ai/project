from __future__ import annotations

from datetime import UTC, datetime

from fastapi import Request
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest
from psycopg import errors as psycopg_errors

from .db import db_conn
from .observability import get_logger

logger = get_logger("metrics")

HTTP_SERVER_REQUESTS_TOTAL = Counter(
    "http_server_requests_total",
    "Total HTTP requests handled by the API.",
    ["method", "route", "status_class"],
)

HTTP_SERVER_REQUEST_DURATION_SECONDS = Histogram(
    "http_server_request_duration_seconds",
    "HTTP request latency in seconds.",
    ["method", "route", "status_class"],
)

HTTP_SERVER_IN_FLIGHT_REQUESTS = Gauge(
    "http_server_in_flight_requests",
    "Current number of in-flight HTTP requests.",
)

APP_QUEUE_DEPTH = Gauge(
    "app_queue_depth",
    "Current number of pending items per queue.",
    ["queue"],
)

APP_QUEUE_OLDEST_AGE_SECONDS = Gauge(
    "app_queue_oldest_age_seconds",
    "Age in seconds of the oldest pending queue item.",
    ["queue"],
)

APP_QUEUE_TABLE_AVAILABLE = Gauge(
    "app_queue_table_available",
    "Whether the backing queue table exists (1) or not (0).",
    ["queue"],
)

APP_QUEUE_JOBS_BY_STATUS = Gauge(
    "app_queue_jobs_by_status",
    "Job counts by queue and status.",
    ["queue", "status"],
)


def metrics_payload() -> bytes:
    return generate_latest()


def metrics_content_type() -> str:
    return CONTENT_TYPE_LATEST


def _status_class(status_code: int | None) -> str:
    if not status_code:
        return "unknown"
    return f"{status_code // 100}xx"


def _route_template(request: Request) -> str:
    route = request.scope.get("route")
    path = getattr(route, "path", None)
    if isinstance(path, str) and path:
        return path
    return "unmatched"


def inc_in_flight_requests() -> None:
    HTTP_SERVER_IN_FLIGHT_REQUESTS.inc()


def dec_in_flight_requests() -> None:
    HTTP_SERVER_IN_FLIGHT_REQUESTS.dec()


def observe_http_request(
    *,
    request: Request,
    status_code: int | None,
    duration_seconds: float,
) -> None:
    method = request.method.upper()
    route = _route_template(request)
    status = _status_class(status_code)
    duration = max(0.0, duration_seconds)

    HTTP_SERVER_REQUESTS_TOTAL.labels(method=method, route=route, status_class=status).inc()
    HTTP_SERVER_REQUEST_DURATION_SECONDS.labels(
        method=method,
        route=route,
        status_class=status,
    ).observe(duration)


def _age_seconds(oldest: datetime | None) -> float:
    if oldest is None:
        return 0.0
    if oldest.tzinfo is None:
        oldest = oldest.replace(tzinfo=UTC)
    return max(0.0, (datetime.now(UTC) - oldest).total_seconds())


def _set_queue_pending(
    *,
    queue_name: str,
    pending_count: int,
    oldest_pending: datetime | None,
    table_available: int,
) -> None:
    APP_QUEUE_TABLE_AVAILABLE.labels(queue=queue_name).set(float(table_available))
    APP_QUEUE_DEPTH.labels(queue=queue_name).set(float(max(0, pending_count)))
    APP_QUEUE_OLDEST_AGE_SECONDS.labels(queue=queue_name).set(_age_seconds(oldest_pending))


def refresh_queue_metrics() -> None:
    APP_QUEUE_JOBS_BY_STATUS.clear()
    try:
        with db_conn() as conn:
            with conn.cursor() as cur:
                # Outbox queue depth.
                try:
                    cur.execute(
                        """
                        SELECT COUNT(*) AS pending_count, MIN(created_at) AS oldest_pending
                        FROM outbox_events
                        WHERE processed_at IS NULL
                        """,
                    )
                    row = cur.fetchone() or {}
                    _set_queue_pending(
                        queue_name="outbox_events",
                        pending_count=int(row.get("pending_count") or 0),
                        oldest_pending=row.get("oldest_pending"),
                        table_available=1,
                    )
                except psycopg_errors.UndefinedTable:
                    _set_queue_pending(
                        queue_name="outbox_events",
                        pending_count=0,
                        oldest_pending=None,
                        table_available=0,
                    )

                # Push queue depth.
                try:
                    cur.execute(
                        """
                        SELECT COUNT(*) AS pending_count, MIN(created_at) AS oldest_pending
                        FROM push_outbox
                        WHERE processed_at IS NULL
                        """,
                    )
                    row = cur.fetchone() or {}
                    _set_queue_pending(
                        queue_name="push_outbox",
                        pending_count=int(row.get("pending_count") or 0),
                        oldest_pending=row.get("oldest_pending"),
                        table_available=1,
                    )
                except psycopg_errors.UndefinedTable:
                    _set_queue_pending(
                        queue_name="push_outbox",
                        pending_count=0,
                        oldest_pending=None,
                        table_available=0,
                    )

                # Import jobs depth and status distribution.
                try:
                    cur.execute(
                        """
                        SELECT COUNT(*) AS pending_count, MIN(created_at) AS oldest_pending
                        FROM import_jobs
                        WHERE status IN ('queued', 'running')
                        """,
                    )
                    row = cur.fetchone() or {}
                    _set_queue_pending(
                        queue_name="import_jobs",
                        pending_count=int(row.get("pending_count") or 0),
                        oldest_pending=row.get("oldest_pending"),
                        table_available=1,
                    )

                    cur.execute(
                        """
                        SELECT status, COUNT(*) AS status_count
                        FROM import_jobs
                        GROUP BY status
                        """,
                    )
                    for status_row in cur.fetchall():
                        status_name = str(status_row.get("status") or "unknown")
                        APP_QUEUE_JOBS_BY_STATUS.labels(
                            queue="import_jobs",
                            status=status_name,
                        ).set(float(int(status_row.get("status_count") or 0)))
                except psycopg_errors.UndefinedTable:
                    _set_queue_pending(
                        queue_name="import_jobs",
                        pending_count=0,
                        oldest_pending=None,
                        table_available=0,
                    )

                # Search indexing jobs depth and status distribution.
                try:
                    cur.execute(
                        """
                        SELECT
                            COUNT(*) AS pending_count,
                            MIN(
                                COALESCE(queued_at, updated_at, started_at, finished_at)
                            ) AS oldest_pending
                        FROM search_index_jobs
                        WHERE status IN ('queued', 'processing')
                        """,
                    )
                    row = cur.fetchone() or {}
                    _set_queue_pending(
                        queue_name="search_index_jobs",
                        pending_count=int(row.get("pending_count") or 0),
                        oldest_pending=row.get("oldest_pending"),
                        table_available=1,
                    )

                    cur.execute(
                        """
                        SELECT status, COUNT(*) AS status_count
                        FROM search_index_jobs
                        GROUP BY status
                        """,
                    )
                    for status_row in cur.fetchall():
                        status_name = str(status_row.get("status") or "unknown")
                        APP_QUEUE_JOBS_BY_STATUS.labels(
                            queue="search_index_jobs",
                            status=status_name,
                        ).set(float(int(status_row.get("status_count") or 0)))
                except psycopg_errors.UndefinedTable:
                    _set_queue_pending(
                        queue_name="search_index_jobs",
                        pending_count=0,
                        oldest_pending=None,
                        table_available=0,
                    )
    except Exception:
        logger.exception("metrics.queue_refresh_failed")
        for queue_name in ("outbox_events", "push_outbox", "import_jobs", "search_index_jobs"):
            _set_queue_pending(
                queue_name=queue_name,
                pending_count=0,
                oldest_pending=None,
                table_available=0,
            )
