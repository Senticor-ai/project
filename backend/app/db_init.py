import time
from pathlib import Path

import psycopg

from .db import run_sql_file

MAX_RETRIES = 5


def main() -> None:
    schema_path = Path(__file__).resolve().parent.parent / "db" / "schema.sql"

    for attempt in range(MAX_RETRIES):
        try:
            run_sql_file(schema_path)
            return
        except psycopg.OperationalError:
            if attempt == MAX_RETRIES - 1:
                raise
            wait = 2**attempt
            print(f"DB not ready, retrying in {wait}s (attempt {attempt + 1}/{MAX_RETRIES})")
            time.sleep(wait)


if __name__ == "__main__":
    main()
