"""Export Pydantic JSON-LD models as JSON Schema + TypeScript types.

Run from anywhere inside the monorepo:
    cd backend && uv run python scripts/export_jsonld_schemas.py

Steps:
  1. Pydantic models  →  schema/*.schema.json   (JSON Schema)
  2. JSON Schema      →  frontend/src/generated/schema/*.d.ts  (TypeScript)

The second step shells out to ``npx json2ts`` (json-schema-to-typescript).
If Node/npx is unavailable it prints a warning but does not fail.
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

# Ensure the backend package is importable when running as a script.
_backend_root = Path(__file__).resolve().parent.parent
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

from pydantic import BaseModel as _BaseModel  # noqa: E402

from app.models import (  # noqa: E402
    ActionThingJsonLd,
    InboxThingJsonLd,
    ProjectThingJsonLd,
    PropertyValueModel,
    ReferenceThingJsonLd,
    ThingPatchModel,
)

MONOREPO_ROOT = _backend_root.parent
SCHEMA_DIR = MONOREPO_ROOT / "schema"
TS_OUTPUT_DIR = MONOREPO_ROOT / "frontend" / "src" / "generated" / "schema"

EXPORTS: dict[str, type[_BaseModel]] = {
    "inbox-thing.schema.json": InboxThingJsonLd,
    "action-thing.schema.json": ActionThingJsonLd,
    "project-thing.schema.json": ProjectThingJsonLd,
    "reference-thing.schema.json": ReferenceThingJsonLd,
    "thing-patch.schema.json": ThingPatchModel,
    "property-value.schema.json": PropertyValueModel,
}


def export_json_schemas() -> None:
    """Step 1: Pydantic models → JSON Schema files."""
    SCHEMA_DIR.mkdir(exist_ok=True)
    for filename, model in EXPORTS.items():
        schema = model.model_json_schema(by_alias=True, mode="serialization")
        (SCHEMA_DIR / filename).write_text(json.dumps(schema, indent=2) + "\n")
        print(f"  {filename}")
    print(f"\nExported {len(EXPORTS)} JSON Schemas to {SCHEMA_DIR}")


def generate_typescript_types() -> None:
    """Step 2: JSON Schema → TypeScript .d.ts files via npx json2ts."""
    npx = shutil.which("npx")
    if npx is None:
        print("\n⚠  npx not found — skipping TypeScript generation.")
        print("   Run manually: cd frontend && npm run generate:schema-types")
        return

    TS_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    for schema_file in sorted(SCHEMA_DIR.glob("*.schema.json")):
        out_file = TS_OUTPUT_DIR / schema_file.name.replace(".json", ".d.ts")
        result = subprocess.run(
            [npx, "json2ts", "-i", str(schema_file), "-o", str(out_file)],
            cwd=str(MONOREPO_ROOT / "frontend"),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"  ✗ {out_file.name}: {result.stderr.strip()}")
        else:
            print(f"  {out_file.name}")

    print(f"\nGenerated TypeScript types in {TS_OUTPUT_DIR}")


def main() -> None:
    export_json_schemas()
    generate_typescript_types()


if __name__ == "__main__":
    main()
