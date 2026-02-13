import time
from pathlib import Path

import psycopg
from alembic.config import Config
from sqlalchemy.exc import OperationalError as SAOperationalError

from alembic import command

MAX_RETRIES = 30
RETRY_INTERVAL = 2  # seconds


def _run_migrations() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    alembic_ini = backend_dir / "alembic.ini"
    alembic_dir = backend_dir / "alembic"

    config = Config(str(alembic_ini))
    config.set_main_option("script_location", str(alembic_dir))
    command.upgrade(config, "head")


def main() -> None:
    for attempt in range(MAX_RETRIES):
        try:
            _run_migrations()
            return
        except (psycopg.OperationalError, SAOperationalError):
            if attempt == MAX_RETRIES - 1:
                raise
            print(
                f"DB not ready, retrying in {RETRY_INTERVAL}s (attempt {attempt + 1}/{MAX_RETRIES})"
            )
            time.sleep(RETRY_INTERVAL)


if __name__ == "__main__":
    main()
