from fastapi import APIRouter, Depends, HTTPException, status

from ..db import db_conn
from ..deps import get_current_org, get_current_user
from ..models import OrgCreateRequest, OrgMemberAddRequest, OrgMemberResponse, OrgResponse

router = APIRouter(prefix="/orgs", tags=["orgs"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[OrgResponse], summary="List orgs for current user")
def list_orgs(current_user=Depends(get_current_user)):
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT o.id, o.name, o.created_at, m.role
                FROM org_memberships m
                JOIN organizations o ON o.id = m.org_id
                WHERE m.user_id = %s AND m.status = 'active'
                ORDER BY o.created_at ASC
                """,
                (current_user["id"],),
            )
            rows = cur.fetchall()

    return [
        OrgResponse(
            id=str(row["id"]),
            name=row["name"],
            role=row["role"],
            created_at=row["created_at"].isoformat(),
        )
        for row in rows
    ]


@router.post("", response_model=OrgResponse, status_code=status.HTTP_201_CREATED)
def create_org(payload: OrgCreateRequest, current_user=Depends(get_current_user)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Name is required")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO organizations (name, owner_user_id)
                VALUES (%s, %s)
                RETURNING id, name, created_at
                """,
                (name, current_user["id"]),
            )
            org = cur.fetchone()

            cur.execute(
                """
                INSERT INTO org_memberships (org_id, user_id, role, status)
                VALUES (%s, %s, 'owner', 'active')
                """,
                (org["id"], current_user["id"]),
            )

            if not current_user.get("default_org_id"):
                cur.execute(
                    "UPDATE users SET default_org_id = %s WHERE id = %s",
                    (org["id"], current_user["id"]),
                )
        conn.commit()

    return OrgResponse(
        id=str(org["id"]),
        name=org["name"],
        role="owner",
        created_at=org["created_at"].isoformat(),
    )


@router.post(
    "/{org_id}/members",
    response_model=OrgMemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a user to an org by email",
)
def add_member(
    org_id: str,
    payload: OrgMemberAddRequest,
    current_org=Depends(get_current_org),
):
    if current_org["org_id"] != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Org access denied")

    role = (payload.role or "member").strip().lower()
    if role not in {"member", "admin"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid role")

    if current_org["role"] not in {"owner", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")

    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Email is required")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, email FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
            user = cur.fetchone()
            if user is None:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

            cur.execute(
                """
                INSERT INTO org_memberships (org_id, user_id, role, status)
                VALUES (%s, %s, %s, 'active')
                ON CONFLICT (org_id, user_id)
                DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = now()
                RETURNING org_id, user_id, role, status, created_at
                """,
                (org_id, user["id"], role),
            )
            membership = cur.fetchone()
        conn.commit()

    return OrgMemberResponse(
        org_id=str(membership["org_id"]),
        user_id=str(membership["user_id"]),
        email=user["email"],
        role=membership["role"],
        status=membership["status"],
        created_at=membership["created_at"].isoformat(),
    )
