import argparse
import time
from datetime import UTC, datetime

import psycopg
from psycopg import sql

from .config import settings
from .db import db_conn, jsonb
from .email.sync import (
    enqueue_all_active_syncs,
    enqueue_due_syncs,
    register_watch,
    run_email_sync,
    sync_email_archive,
)
from .metrics import APP_IMPORTS_COMPLETED_TOTAL, APP_IMPORTS_FAILED_TOTAL
from .observability import configure_logging, get_logger
from .outbox import OUTBOX_NOTIFY_CHANNEL
from .push_events import enqueue_push_payload
from .search.indexer import delete_item, index_file, index_item
from .search.jobs import mark_failed, mark_processing, mark_skipped, mark_succeeded
from .search.meili import is_enabled
from .worker_health import (
    WORKER_BATCH_DURATION_SECONDS,
    WORKER_BATCHES_TOTAL,
    WORKER_EVENTS_TOTAL,
    WorkerHealthState,
    start_health_server,
)

configure_logging()
logger = get_logger("projection-worker")


def _mark_processed(conn, event_id: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE outbox_events SET processed_at = %s WHERE event_id = %s",
            (datetime.now(UTC), event_id),
        )


def _mark_failed(conn, event_id: str, error: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE outbox_events
            SET attempts = attempts + 1, last_error = %s
            WHERE event_id = %s
            """,
            (error[:500], event_id),
        )


def _mark_dead_letter(conn, event_id: str, error: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE outbox_events
            SET dead_lettered_at = %s, attempts = attempts + 1, last_error = %s
            WHERE event_id = %s
            """,
            (datetime.now(UTC), error[:500], event_id),
        )


def _get_attempts(conn, event_id: str) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT attempts FROM outbox_events WHERE event_id = %s", (event_id,))
        row = cur.fetchone()
        return int(row["attempts"]) if row else 0


def _emit_index_event(
    *,
    status: str,
    entity_type: str,
    entity_id: str,
    org_id: str,
    action: str,
    title: str,
    body: str,
    target_user_id: str | None,
) -> None:
    if not settings.vapid_private_key:
        return
    if not target_user_id:
        return

    payload = {
        "title": title,
        "body": body,
        "url": f"/{entity_type}s/{entity_id}",
        "data": {
            "event": "search_index_status",
            "status": status,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "org_id": org_id,
            "action": action,
        },
    }
    try:
        enqueue_push_payload(target_user_id, payload)
    except Exception as exc:  # noqa: BLE001
        logger.warning("push.enqueue_failed", error=str(exc))


def _make_progress_cb(job_id: str, total: int):
    """Return a throttled callback that writes progress to the import_jobs table.

    The callback receives ``(processed, stats)`` where *stats* is a dict of
    running counters (created, updated, skipped, errors, …).
    """
    last_update = [0.0]

    def cb(processed: int, stats: dict[str, int]) -> None:
        now = time.monotonic()
        if now - last_update[0] < 2.0 and processed < total:
            return
        last_update[0] = now
        progress = {"processed": processed, "total": total, **stats}
        with db_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE import_jobs SET progress = %s, updated_at = %s WHERE job_id = %s",
                    (jsonb(progress), datetime.now(UTC), job_id),
                )
            conn.commit()

    return cb


def _process_import_job(payload: dict) -> None:
    job_id = payload.get("job_id")
    if not job_id:
        raise ValueError("missing job_id")
    logger.info("import_job.worker_started", job_id=str(job_id))

    with db_conn() as job_conn:
        with job_conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    job_id,
                    org_id,
                    owner_id,
                    file_id,
                    source,
                    status,
                    options
                FROM import_jobs
                WHERE job_id = %s
                FOR UPDATE
                """,
                (job_id,),
            )
            job = cur.fetchone()

            if job is None:
                raise ValueError("import job not found")

            if job["status"] in {"completed", "failed"}:
                logger.info(
                    "import_job.worker_skipped_terminal",
                    job_id=str(job_id),
                    status=job["status"],
                )
                return

            cur.execute(
                """
                UPDATE import_jobs
                SET status = 'running',
                    started_at = %s,
                    updated_at = %s
                WHERE job_id = %s
                """,
                (datetime.now(UTC), datetime.now(UTC), job_id),
            )
            logger.info(
                "import_job.running",
                job_id=str(job_id),
                org_id=str(job["org_id"]),
                file_id=str(job["file_id"]),
                source=job["source"],
            )
        job_conn.commit()

    with db_conn() as job_conn:
        with job_conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    file_id,
                    org_id,
                    storage_path
                FROM files
                WHERE file_id = %s AND org_id = %s
                """,
                (job["file_id"], job["org_id"]),
            )
            file_row = cur.fetchone()

    if file_row is None:
        raise ValueError("import file not found")

    from .routes.imports import _load_items_from_file, run_native_import, run_nirvana_import

    options = job.get("options") or {}
    loaded_items = _load_items_from_file(file_row)

    # Write initial progress and create throttled callback
    total = len(loaded_items)
    progress_cb = _make_progress_cb(str(job_id), total)
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE import_jobs SET progress = %s, updated_at = %s WHERE job_id = %s",
                (jsonb({"processed": 0, "total": total}), datetime.now(UTC), job_id),
            )
        conn.commit()

    if job["source"] == "native":
        summary = run_native_import(
            loaded_items,
            org_id=str(job["org_id"]),
            user_id=str(job["owner_id"]),
            source=job["source"],
            dry_run=False,
            update_existing=bool(options.get("update_existing", True)),
            include_completed=bool(options.get("include_completed", True)),
            emit_events=bool(options.get("emit_events", True)),
            on_progress=progress_cb,
        )
    else:
        summary = run_nirvana_import(
            loaded_items,
            org_id=str(job["org_id"]),
            user_id=str(job["owner_id"]),
            source=job["source"],
            dry_run=False,
            update_existing=bool(options.get("update_existing", True)),
            include_completed=bool(options.get("include_completed", True)),
            emit_events=bool(options.get("emit_events", True)),
            state_bucket_map=options.get("state_bucket_map"),
            default_bucket=options.get("default_bucket", "inbox"),
            on_progress=progress_cb,
        )

    with db_conn() as job_conn:
        with job_conn.cursor() as cur:
            cur.execute(
                """
                UPDATE import_jobs
                SET status = 'completed',
                    summary = %s,
                    progress = NULL,
                    finished_at = %s,
                    updated_at = %s
                WHERE job_id = %s
                """,
                (
                    jsonb(summary.model_dump()),
                    datetime.now(UTC),
                    datetime.now(UTC),
                    job_id,
                ),
            )
        job_conn.commit()
    logger.info(
        "import_job.completed",
        job_id=str(job_id),
        org_id=str(job["org_id"]),
        file_id=str(job["file_id"]),
        source=job["source"],
        summary=summary.model_dump(),
    )


def _mark_import_failed(job_id: str | None, error: str) -> None:
    if not job_id:
        return
    try:
        with db_conn() as job_conn:
            with job_conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE import_jobs
                    SET status = 'failed',
                        error = %s,
                        finished_at = %s,
                        updated_at = %s
                    WHERE job_id = %s
                    """,
                    (
                        error[:500],
                        datetime.now(UTC),
                        datetime.now(UTC),
                        job_id,
                    ),
                )
            job_conn.commit()
        logger.error("import_job.failed", job_id=str(job_id), error=error[:500])
    except Exception:  # noqa: BLE001
        logger.exception("import_job.mark_failed", job_id=job_id)


def process_batch(limit: int = 25) -> int:
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT event_id, event_type, payload
                FROM outbox_events
                WHERE processed_at IS NULL AND dead_lettered_at IS NULL
                ORDER BY created_at ASC
                LIMIT %s
                FOR UPDATE SKIP LOCKED
                """,
                (limit,),
            )
            events = cur.fetchall()
        if not events:
            logger.debug("outbox.idle")
            return 0
        logger.debug("outbox.batch_fetched", fetched=len(events), limit=limit)

        processed = 0
        for event in events:
            event_id = event["event_id"]
            event_type = event["event_type"]
            payload = event["payload"] or {}
            started_at = time.monotonic()
            logger.debug("outbox.event_start", event_id=str(event_id), event_type=event_type)

            entity_type = None
            entity_id = None
            org_id = payload.get("org_id") if isinstance(payload, dict) else None
            action = "upsert"
            target_user_id = None

            try:
                if event_type == "item_upserted":
                    entity_type = "item"
                    if not org_id:
                        raise ValueError("missing org_id")
                    if not payload.get("item_id"):
                        raise ValueError("missing item_id")
                    entity_id = str(payload.get("item_id"))
                    action = "upsert"
                    if org_id and entity_id:
                        mark_processing(org_id, entity_type, entity_id, action=action)
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            SELECT
                                item_id,
                                org_id,
                                canonical_id,
                                source,
                                schema_jsonld,
                                created_at,
                                updated_at,
                                created_by_user_id
                            FROM items
                            WHERE item_id = %s
                            """,
                            (payload["item_id"],),
                        )
                        row = cur.fetchone()
                    if row is None:
                        raise ValueError("item not found for indexing")
                    target_user_id = payload.get("_context", {}).get("user_id")
                    if not target_user_id:
                        target_user_id = (
                            str(row.get("created_by_user_id"))
                            if row.get("created_by_user_id")
                            else None
                        )
                    if is_enabled():
                        index_item(row)
                        mark_succeeded(org_id, entity_type, entity_id, action=action)
                        _emit_index_event(
                            status="succeeded",
                            entity_type=entity_type,
                            entity_id=entity_id,
                            org_id=org_id,
                            action=action,
                            title="Item indexed",
                            body=f"{row.get('canonical_id') or entity_id} indexed.",
                            target_user_id=target_user_id,
                        )
                    else:
                        mark_skipped(
                            org_id,
                            entity_type,
                            entity_id,
                            reason="Search disabled",
                            action=action,
                        )
                elif event_type == "item_archived":
                    entity_type = "item"
                    if not org_id:
                        raise ValueError("missing org_id")
                    if not payload.get("item_id"):
                        raise ValueError("missing item_id")
                    entity_id = str(payload.get("item_id"))
                    action = "delete"
                    if org_id and entity_id:
                        mark_processing(org_id, entity_type, entity_id, action=action)
                    if is_enabled():
                        delete_item(payload.get("item_id", ""))
                        mark_succeeded(org_id, entity_type, entity_id, action=action)
                        _emit_index_event(
                            status="succeeded",
                            entity_type=entity_type,
                            entity_id=entity_id,
                            org_id=org_id,
                            action=action,
                            title="Item removed from search",
                            body=f"Item {entity_id} removed from search.",
                            target_user_id=payload.get("_context", {}).get("user_id"),
                        )
                    else:
                        mark_skipped(
                            org_id,
                            entity_type,
                            entity_id,
                            reason="Search disabled",
                            action=action,
                        )
                    # Mark email as read in Gmail if this was a gmail-sourced item
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            SELECT item_id, org_id, source, schema_jsonld,
                                   created_by_user_id
                            FROM items
                            WHERE item_id = %s
                            """,
                            (entity_id,),
                        )
                        archived_row = cur.fetchone()
                    if archived_row and archived_row.get("source") == "gmail":
                        try:
                            sync_email_archive(archived_row, org_id)
                        except Exception:
                            logger.warning(
                                "email.archive_sync_failed",
                                item_id=entity_id,
                                exc_info=True,
                            )
                elif event_type == "file_uploaded":
                    entity_type = "file"
                    if not org_id:
                        raise ValueError("missing org_id")
                    if not payload.get("file_id"):
                        raise ValueError("missing file_id")
                    entity_id = str(payload.get("file_id"))
                    action = "upsert"
                    if org_id and entity_id:
                        mark_processing(org_id, entity_type, entity_id, action=action)
                    with conn.cursor() as cur:
                        cur.execute(
                            """
                            SELECT
                                file_id,
                                org_id,
                                owner_id,
                                original_name,
                                content_type,
                                size_bytes,
                                sha256,
                                storage_path,
                                created_at
                            FROM files
                            WHERE file_id = %s
                            """,
                            (payload["file_id"],),
                        )
                        row = cur.fetchone()
                    if row is None:
                        raise ValueError("file not found for indexing")
                    target_user_id = str(row.get("owner_id")) if row.get("owner_id") else None
                    if is_enabled() and settings.meili_index_files_enabled:
                        index_file(row)
                        mark_succeeded(org_id, entity_type, entity_id, action=action)
                        _emit_index_event(
                            status="succeeded",
                            entity_type=entity_type,
                            entity_id=entity_id,
                            org_id=org_id,
                            action=action,
                            title="File indexed",
                            body=f"{row.get('original_name') or entity_id} indexed.",
                            target_user_id=target_user_id,
                        )
                    else:
                        mark_skipped(
                            org_id,
                            entity_type,
                            entity_id,
                            reason="File indexing disabled",
                            action=action,
                        )
                elif event_type in ("nirvana_import_job", "native_import_job"):
                    _process_import_job(payload)
                    source = "nirvana" if event_type == "nirvana_import_job" else "native"
                    APP_IMPORTS_COMPLETED_TOTAL.labels(source=source).inc()
                elif event_type == "email_sync_job":
                    sync_conn_id = payload.get("connection_id")
                    sync_org_id = payload.get("org_id")
                    sync_user_id = payload.get("user_id")
                    if not sync_conn_id or not sync_org_id or not sync_user_id:
                        raise ValueError("email_sync_job missing required fields")
                    result = run_email_sync(
                        connection_id=sync_conn_id,
                        org_id=sync_org_id,
                        user_id=sync_user_id,
                    )
                    logger.info(
                        "email_sync.completed",
                        connection_id=sync_conn_id,
                        synced=result.synced,
                        created=result.created,
                    )
                elif event_type == "email_watch_renew":
                    renew_conn_id = payload.get("connection_id")
                    renew_org_id = payload.get("org_id")
                    if not renew_conn_id or not renew_org_id:
                        raise ValueError("email_watch_renew missing required fields")
                    register_watch(renew_conn_id, renew_org_id)
                    logger.info(
                        "email_watch.renewed",
                        connection_id=renew_conn_id,
                    )

                _mark_processed(conn, event_id)
                processed += 1
                logger.debug(
                    "outbox.event_processed",
                    event_id=str(event_id),
                    event_type=event_type,
                    duration_ms=int((time.monotonic() - started_at) * 1000),
                )
            except Exception as exc:  # noqa: BLE001
                logger.exception("outbox.process_failed", event_id=str(event_id))
                if event_type in ("nirvana_import_job", "native_import_job"):
                    source = "nirvana" if event_type == "nirvana_import_job" else "native"
                    APP_IMPORTS_FAILED_TOTAL.labels(source=source).inc()
                    _mark_import_failed(payload.get("job_id"), str(exc))
                if org_id and entity_type and entity_id:
                    try:
                        mark_failed(
                            org_id,
                            entity_type,
                            entity_id,
                            str(exc),
                            action=action,
                        )
                        _emit_index_event(
                            status="failed",
                            entity_type=entity_type,
                            entity_id=entity_id,
                            org_id=org_id,
                            action=action,
                            title="Search indexing failed",
                            body=f"Indexing failed for {entity_type} {entity_id}.",
                            target_user_id=target_user_id,
                        )
                    except Exception:  # noqa: BLE001
                        logger.warning(
                            "outbox.search_job_update_failed",
                            event_id=str(event_id),
                            entity_type=entity_type,
                            entity_id=entity_id,
                        )
                new_attempts = _get_attempts(conn, event_id) + 1
                if new_attempts >= settings.outbox_max_attempts:
                    _mark_dead_letter(conn, event_id, str(exc))
                    logger.warning(
                        "outbox.event_dead_lettered",
                        event_id=str(event_id),
                        event_type=event_type,
                        attempts=new_attempts,
                        error=str(exc)[:500],
                    )
                else:
                    _mark_failed(conn, event_id, str(exc))
                    logger.error(
                        "outbox.event_failed",
                        event_id=str(event_id),
                        event_type=event_type,
                        duration_ms=int((time.monotonic() - started_at) * 1000),
                        error=str(exc)[:500],
                    )

        conn.commit()
        logger.debug("outbox.batch_done", fetched=len(events), processed=processed, limit=limit)
        return processed


def _outbox_notify_channel() -> str:
    channel = (settings.outbox_notify_channel or OUTBOX_NOTIFY_CHANNEL).strip()
    return channel or OUTBOX_NOTIFY_CHANNEL


def _open_outbox_listener() -> psycopg.Connection | None:
    channel = _outbox_notify_channel()
    try:
        listener_conn = psycopg.connect(settings.database_url, autocommit=True)
        with listener_conn.cursor() as cur:
            cur.execute(sql.SQL("LISTEN {}").format(sql.Identifier(channel)))
        logger.info("outbox.listen_ready", channel=channel)
        return listener_conn
    except Exception:  # noqa: BLE001
        logger.warning("outbox.listen_start_failed", channel=channel, exc_info=True)
        return None


def _wait_for_outbox_signal(listener_conn: psycopg.Connection, timeout: float) -> bool | None:
    timeout_seconds = max(0.1, float(timeout))
    try:
        for notification in listener_conn.notifies(timeout=timeout_seconds, stop_after=1):
            logger.debug(
                "outbox.notified",
                channel=notification.channel,
                payload=notification.payload,
            )
            return True
        return False
    except Exception:  # noqa: BLE001
        logger.warning("outbox.listen_wait_failed", exc_info=True)
        return None


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Process outbox events")
    parser.add_argument(
        "--loop",
        action="store_true",
        help="Run continuously and poll for new outbox events.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=25,
        help="Number of outbox events to process per batch.",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=settings.outbox_worker_poll_seconds,
        help=(
            "Poll interval in seconds when looping without LISTEN/NOTIFY. "
            "Also used as reconnect backoff when LISTEN/NOTIFY is unavailable."
        ),
    )
    parser.add_argument(
        "--idle-wait",
        type=float,
        default=settings.outbox_worker_notify_fallback_seconds,
        help=(
            "When LISTEN/NOTIFY is enabled, max seconds to block waiting for wakeups "
            "before running a fallback poll."
        ),
    )
    parser.add_argument(
        "--listen-notify",
        action=argparse.BooleanOptionalAction,
        default=settings.outbox_worker_listen_notify,
        help="Use Postgres LISTEN/NOTIFY wakeups for near-zero idle polling.",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    batch_size = max(1, args.batch_size)
    interval = max(0.1, float(args.interval))
    idle_wait = max(0.1, float(args.idle_wait))
    use_listen_notify = bool(args.listen_notify)

    if not args.loop:
        count = process_batch(limit=batch_size)
        logger.info("outbox.processed", count=count, batch_size=batch_size)
        return

    listener_conn: psycopg.Connection | None = None
    if use_listen_notify:
        listener_conn = _open_outbox_listener()

    health_poll_interval = idle_wait if use_listen_notify else interval
    _name = "projection-worker"
    health_state = WorkerHealthState(
        _name,
        poll_interval=health_poll_interval,
        staleness_multiplier=settings.worker_health_staleness_multiplier,
    )
    start_health_server(health_state, settings.worker_health_port)

    # Periodic email sync reconciliation (every 5 min)
    email_sync_interval = 300.0  # 5 minutes
    last_email_sync_check = 0.0

    # Periodic idle container reaping (every 60s)
    container_reap_interval = 60.0
    last_container_reap = 0.0

    # Sync all active email connections immediately on startup
    try:
        enqueue_all_active_syncs()
    except Exception:
        logger.warning("outbox.startup_sync_failed", exc_info=True)

    logger.info(
        "outbox.loop_started",
        batch_size=batch_size,
        interval_seconds=interval,
        idle_wait_seconds=idle_wait,
        listen_notify=use_listen_notify,
        notify_channel=_outbox_notify_channel(),
    )
    try:
        while True:
            batch_start = time.monotonic()
            count = process_batch(limit=batch_size)
            batch_duration = time.monotonic() - batch_start

            WORKER_BATCHES_TOTAL.labels(worker=_name).inc()
            WORKER_EVENTS_TOTAL.labels(worker=_name).inc(count)
            WORKER_BATCH_DURATION_SECONDS.labels(worker=_name).observe(batch_duration)
            health_state.touch()

            if count:
                logger.info("outbox.processed", count=count, batch_size=batch_size)

            # Periodic email sync reconciliation
            now = time.monotonic()
            if now - last_email_sync_check >= email_sync_interval:
                try:
                    enqueued = enqueue_due_syncs()
                    if enqueued:
                        logger.info("email.enqueue_due_syncs", count=enqueued)
                except Exception:
                    logger.warning("email.enqueue_due_syncs_failed", exc_info=True)
                last_email_sync_check = now

            # Periodic idle container reaping
            if now - last_container_reap >= container_reap_interval:
                try:
                    from .container.manager import reap_idle, reap_orphaned_k8s_resources

                    reaped = reap_idle()
                    if reaped:
                        logger.info("container.idle_reaped_batch", count=reaped)
                    orphaned = reap_orphaned_k8s_resources()
                    if orphaned["pods"] or orphaned["services"]:
                        logger.info(
                            "container.k8s_orphans_reaped_batch",
                            pods=orphaned["pods"],
                            services=orphaned["services"],
                        )
                except Exception:
                    logger.warning("container.reap_failed", exc_info=True)
                last_container_reap = now

            # When we don't fill the entire batch, either block on LISTEN/NOTIFY
            # (plus periodic fallback polling) or sleep before polling again.
            if count < batch_size:
                if use_listen_notify:
                    if listener_conn is None:
                        listener_conn = _open_outbox_listener()
                        if listener_conn is None:
                            time.sleep(interval)
                            continue
                    wait_result = _wait_for_outbox_signal(listener_conn, idle_wait)
                    if wait_result is None:
                        try:
                            listener_conn.close()
                        except Exception:  # noqa: BLE001
                            logger.debug("outbox.listen_close_failed", exc_info=True)
                        listener_conn = None
                        time.sleep(interval)
                else:
                    time.sleep(interval)
    except KeyboardInterrupt:
        logger.info("outbox.loop_stopped")
    finally:
        if listener_conn is not None:
            try:
                listener_conn.close()
            except Exception:  # noqa: BLE001
                logger.debug("outbox.listen_close_failed", exc_info=True)


if __name__ == "__main__":
    main()
