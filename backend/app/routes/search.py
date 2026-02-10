from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..config import settings
from ..deps import get_current_org, get_current_user
from ..search.meili import is_enabled, search
from ..search.ocr_settings import available_ocr_engines, get_ocr_config, upsert_ocr_config

router = APIRouter(prefix="/search", tags=["search"], dependencies=[Depends(get_current_user)])


class OcrConfigRequest(BaseModel):
    engine: str | None = None
    languages: list[str] | None = None
    force_full_page_ocr: bool | None = None
    bitmap_area_threshold: float | None = Field(default=None, ge=0.0, le=1.0)


class OcrConfigResponse(BaseModel):
    org_id: str
    engine: str
    languages: list[str]
    force_full_page_ocr: bool
    bitmap_area_threshold: float
    available_engines: list[str] | None = None


@router.get("", summary="Search indexed documents")
def search_index(
    q: str = "",
    index: Literal["items", "files"] = "items",
    limit: int = 20,
    offset: int = 0,
    current_org=Depends(get_current_org),
):
    if not is_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Search is not configured",
        )

    if limit < 1 or limit > 100:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="limit must be between 1 and 100",
        )

    if offset < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="offset must be >= 0",
        )

    if index == "files" and not settings.meili_index_files_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File search is disabled",
        )

    index_uid = settings.meili_index_items if index == "items" else settings.meili_index_files

    try:
        result = search(
            index_uid,
            q,
            org_id=current_org["org_id"],
            limit=limit,
            offset=offset,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Search backend error",
        ) from exc

    return JSONResponse(content=result)


@router.get(
    "/ocr-config",
    response_model=OcrConfigResponse,
    summary="Get OCR configuration for file indexing",
)
def get_ocr_config_route(current_org=Depends(get_current_org)):
    config = get_ocr_config(current_org["org_id"])
    response = OcrConfigResponse(
        org_id=current_org["org_id"],
        engine=config.engine,
        languages=list(config.languages),
        force_full_page_ocr=config.force_full_page_ocr,
        bitmap_area_threshold=config.bitmap_area_threshold,
        available_engines=available_ocr_engines(),
    )
    return JSONResponse(content=response.model_dump())


@router.put(
    "/ocr-config",
    response_model=OcrConfigResponse,
    summary="Update OCR configuration for file indexing",
)
def update_ocr_config(payload: OcrConfigRequest, current_org=Depends(get_current_org)):
    current = get_ocr_config(current_org["org_id"])
    engine = (payload.engine or current.engine).strip().lower()
    languages = payload.languages if payload.languages is not None else list(current.languages)
    force_full_page_ocr = (
        payload.force_full_page_ocr
        if payload.force_full_page_ocr is not None
        else current.force_full_page_ocr
    )
    bitmap_area_threshold = (
        payload.bitmap_area_threshold
        if payload.bitmap_area_threshold is not None
        else current.bitmap_area_threshold
    )

    available = available_ocr_engines()
    if engine not in available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown OCR engine '{engine}'. Available: {', '.join(available)}",
        )

    updated = upsert_ocr_config(
        current_org["org_id"],
        engine=engine,
        languages=languages,
        force_full_page_ocr=force_full_page_ocr,
        bitmap_area_threshold=bitmap_area_threshold,
    )
    response = OcrConfigResponse(
        org_id=current_org["org_id"],
        engine=updated.engine,
        languages=list(updated.languages),
        force_full_page_ocr=updated.force_full_page_ocr,
        bitmap_area_threshold=updated.bitmap_area_threshold,
        available_engines=available,
    )
    return JSONResponse(content=response.model_dump())
