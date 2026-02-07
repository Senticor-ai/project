from contextlib import contextmanager
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import settings


@contextmanager
def db_conn():
    with psycopg.connect(settings.database_url, row_factory=dict_row) as conn:
        yield conn


def run_sql_file(path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()


def jsonb(value):
    return Jsonb(value)
