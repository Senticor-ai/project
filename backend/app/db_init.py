from pathlib import Path

from .db import run_sql_file


def main() -> None:
    schema_path = Path(__file__).resolve().parent.parent / "db" / "schema.sql"
    run_sql_file(schema_path)


if __name__ == "__main__":
    main()
