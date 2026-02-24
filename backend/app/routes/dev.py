from fastapi import APIRouter, Depends, HTTPException, status

from ..config import settings
from ..db import db_conn
from ..deps import get_current_org, get_current_user
from ..observability import get_logger

logger = get_logger("routes.dev")

router = APIRouter(
    prefix="/dev",
    tags=["dev"],
    dependencies=[Depends(get_current_user)],
)


def _require_dev_tools() -> None:
    if not settings.dev_tools_enabled:
        logger.warning(
            "dev.flush.rejected",
            reason="DEV_TOOLS_ENABLED is false",
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not found",
        )


@router.post("/flush", summary="Hard-delete all data for the current org (dev only)")
def flush_org_data(
    current_org=Depends(get_current_org),
):
    _require_dev_tools()

    org_id = current_org["org_id"]
    deleted: dict[str, int] = {}

    with db_conn() as conn:
        with conn.cursor() as cur:
            # Order matters: delete children before parents (FK constraints)

            cur.execute(
                "DELETE FROM search_index_jobs WHERE org_id = %s",
                (org_id,),
            )
            deleted["search_index_jobs"] = cur.rowcount

            cur.execute(
                "DELETE FROM assertions WHERE org_id = %s",
                (org_id,),
            )
            deleted["assertions"] = cur.rowcount

            cur.execute(
                "DELETE FROM idempotency_keys WHERE org_id = %s",
                (org_id,),
            )
            deleted["idempotency_keys"] = cur.rowcount

            cur.execute(
                "DELETE FROM items WHERE org_id = %s",
                (org_id,),
            )
            deleted["items"] = cur.rowcount

            cur.execute(
                "DELETE FROM import_jobs WHERE org_id = %s",
                (org_id,),
            )
            deleted["import_jobs"] = cur.rowcount

            cur.execute(
                "DELETE FROM file_uploads WHERE org_id = %s",
                (org_id,),
            )
            deleted["file_uploads"] = cur.rowcount

            cur.execute(
                "DELETE FROM files WHERE org_id = %s",
                (org_id,),
            )
            deleted["files"] = cur.rowcount

        conn.commit()

    logger.info("dev.flush.completed", org_id=org_id, deleted=deleted)
    return {"ok": True, "deleted": deleted}
