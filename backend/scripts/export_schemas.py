"""Export JSON Schemas from Pydantic models to static files.

Usage:
    uv run python scripts/export_schemas.py [output_dir]

Default output: ../frontend/src/lib/__tests__/schemas/
"""

import json
import sys
from pathlib import Path

# Allow importing app modules from the backend directory.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routes.schemas import _REGISTRY, _build_schema

DEFAULT_OUT = (
    Path(__file__).resolve().parents[2]
    / "frontend"
    / "src"
    / "lib"
    / "__tests__"
    / "schemas"
)


def main() -> None:
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_OUT
    out_dir.mkdir(parents=True, exist_ok=True)

    for name, model in sorted(_REGISTRY.items()):
        schema = _build_schema(model)
        path = out_dir / f"{name}.json"
        path.write_text(json.dumps(schema, indent=2) + "\n")

    print(f"Exported {len(_REGISTRY)} schemas to {out_dir}")


if __name__ == "__main__":
    main()
