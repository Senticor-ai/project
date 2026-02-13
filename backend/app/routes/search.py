from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse

from ..config import settings
from ..deps import get_current_org, get_current_user
from ..search.meili import is_enabled, search

router = APIRouter(prefix="/search", tags=["search"], dependencies=[Depends(get_current_user)])


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
