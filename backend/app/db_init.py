import time
from pathlib import Path

import psycopg

from .db import run_sql_file

MAX_RETRIES = 30
RETRY_INTERVAL = 2  # seconds


def main() -> None:
    schema_path = Path(__file__).resolve().parent.parent / "db" / "schema.sql"

    for attempt in range(MAX_RETRIES):
        try:
            run_sql_file(schema_path)
            return
        except psycopg.OperationalError:
            if attempt == MAX_RETRIES - 1:
                raise
            print(
                f"DB not ready, retrying in {RETRY_INTERVAL}s (attempt {attempt + 1}/{MAX_RETRIES})"
            )
            time.sleep(RETRY_INTERVAL)


if __name__ == "__main__":
    main()
