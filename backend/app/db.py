import time
import uuid
from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import settings
from .observability import get_logger, get_request_context

logger = get_logger("db")
_SQL_PREVIEW_CHARS = 240


def _sql_preview(query: object) -> str:
    statement = " ".join(str(query).split())
    if len(statement) <= _SQL_PREVIEW_CHARS:
        return statement
    return f"{statement[:_SQL_PREVIEW_CHARS]}..."


class InstrumentedCursor(psycopg.Cursor):
    def execute(self, query, params=None, *, prepare=None, binary=None):
        context = get_request_context()
        db_call_id = str(uuid.uuid4())
        statement = _sql_preview(query)
        started = time.monotonic()
        try:
            result = super().execute(
                query,
                params=params,
                prepare=prepare,
                binary=binary,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "db.query.failed",
                trail_id=context.get("trail_id"),
                db_call_id=db_call_id,
                statement=statement,
                duration_ms=int((time.monotonic() - started) * 1000),
                error=str(exc),
            )
            raise
        logger.info(
            "db.query",
            trail_id=context.get("trail_id"),
            db_call_id=db_call_id,
            statement=statement,
            duration_ms=int((time.monotonic() - started) * 1000),
            rowcount=self.rowcount,
        )
        return result

    def executemany(self, query, params_seq, *, returning=False):
        context = get_request_context()
        db_call_id = str(uuid.uuid4())
        statement = _sql_preview(query)
        started = time.monotonic()
        try:
            result = super().executemany(query, params_seq, returning=returning)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "db.executemany.failed",
                trail_id=context.get("trail_id"),
                db_call_id=db_call_id,
                statement=statement,
                duration_ms=int((time.monotonic() - started) * 1000),
                error=str(exc),
            )
            raise
        logger.info(
            "db.executemany",
            trail_id=context.get("trail_id"),
            db_call_id=db_call_id,
            statement=statement,
            duration_ms=int((time.monotonic() - started) * 1000),
            rowcount=self.rowcount,
        )
        return result


@contextmanager
def db_conn():
    with psycopg.connect(
        settings.database_url,
        row_factory=dict_row,
        cursor_factory=InstrumentedCursor,
    ) as conn:
        yield conn


def run_sql_file(path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()


def jsonb(value):
    return Jsonb(value)
