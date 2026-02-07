"""JSON Schema endpoints for JSON-LD payload contracts.

Serves the machine-readable schemas generated from Pydantic models.
These are the single source of truth for the JSON-LD payloads
exchanged between frontend and backend.
"""

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse

from ..models import (
    ActionThingJsonLd,
    InboxThingJsonLd,
    ProjectThingJsonLd,
    PropertyValueModel,
    ReferenceThingJsonLd,
    ThingPatchModel,
)

router = APIRouter(prefix="/schemas", tags=["schemas"])

_REGISTRY: dict[str, type] = {
    "inbox-thing": InboxThingJsonLd,
    "action-thing": ActionThingJsonLd,
    "project-thing": ProjectThingJsonLd,
    "reference-thing": ReferenceThingJsonLd,
    "thing-patch": ThingPatchModel,
    "property-value": PropertyValueModel,
}


def _build_schema(model: type) -> dict:
    return model.model_json_schema(by_alias=True, mode="serialization")  # type: ignore[attr-defined]


@router.get(
    "",
    summary="List available JSON-LD schemas",
    description="Returns the names of all published JSON Schema contracts.",
)
def list_schemas() -> dict:
    return {
        "schemas": sorted(_REGISTRY.keys()),
    }


@router.get(
    "/{name}",
    summary="Get a JSON-LD schema by name",
    description=(
        "Returns the JSON Schema for a specific entity type. "
        "Use the name from the listing endpoint (e.g. `inbox-thing`, `action-thing`)."
    ),
)
def get_schema(name: str) -> JSONResponse:
    model = _REGISTRY.get(name)
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schema '{name}' not found. Available: {sorted(_REGISTRY.keys())}",
        )
    schema = _build_schema(model)
    return JSONResponse(
        content=schema,
        media_type="application/schema+json",
    )
