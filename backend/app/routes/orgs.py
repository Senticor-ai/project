from fastapi import APIRouter, Depends, HTTPException, status

from ..db import db_conn, jsonb
from ..deps import get_current_org, get_current_user
from ..models import OrgCreateRequest, OrgMemberAddRequest, OrgMemberResponse, OrgResponse

router = APIRouter(prefix="/orgs", tags=["orgs"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[OrgResponse], summary="List orgs for current user")
def list_orgs(current_user=Depends(get_current_user)):
    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT o.id, o.name, o.created_at, m.role,
                       o.general_doc_id, o.user_doc_id, o.log_doc_id, o.agent_doc_id
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
            general_doc_id=str(row["general_doc_id"]) if row["general_doc_id"] else None,
            user_doc_id=str(row["user_doc_id"]) if row["user_doc_id"] else None,
            log_doc_id=str(row["log_doc_id"]) if row["log_doc_id"] else None,
            agent_doc_id=str(row["agent_doc_id"]) if row["agent_doc_id"] else None,
        )
        for row in rows
    ]


@router.post("", response_model=OrgResponse, status_code=status.HTTP_201_CREATED)
def create_org(payload: OrgCreateRequest, current_user=Depends(get_current_user)):
    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Name is required",
        )

    with db_conn() as conn:
        with conn.cursor() as cur:
            # Step 1: Create org record (without doc IDs yet)
            cur.execute(
                """
                INSERT INTO organizations (name, owner_user_id)
                VALUES (%s, %s)
                RETURNING id, name, created_at
                """,
                (name, current_user["id"]),
            )
            org = cur.fetchone()

            # Step 2: Create 4 document items
            doc_ids = {}
            for doc_type in ["GENERAL", "USER", "LOG", "AGENT"]:
                cur.execute(
                    """
                    INSERT INTO items (
                        org_id, created_by_user_id, canonical_id, schema_jsonld, source
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING item_id
                    """,
                    (
                        org["id"],
                        current_user["id"],
                        f"org:{org['id']}:knowledge:{doc_type.lower()}",
                        jsonb(
                            {
                                "@type": "DigitalDocument",
                                "name": f"Organization {doc_type.title()} Knowledge",
                                "encodingFormat": "text/markdown",
                                "text": "",
                            }
                        ),
                        "system",
                    ),
                )
                doc_ids[doc_type.lower()] = cur.fetchone()["item_id"]

            # Step 3: Update org with doc IDs
            cur.execute(
                """
                UPDATE organizations
                SET general_doc_id = %s, user_doc_id = %s, log_doc_id = %s, agent_doc_id = %s
                WHERE id = %s
                """,
                (doc_ids["general"], doc_ids["user"], doc_ids["log"], doc_ids["agent"], org["id"]),
            )

            # Step 4: Create membership (existing logic)
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
        general_doc_id=str(doc_ids["general"]),
        user_doc_id=str(doc_ids["user"]),
        log_doc_id=str(doc_ids["log"]),
        agent_doc_id=str(doc_ids["agent"]),
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid role",
        )

    if current_org["role"] not in {"owner", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")

    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email is required",
        )

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


@router.get(
    "/{org_id}/members/{user_id}",
    response_model=OrgMemberResponse,
    summary="Lookup an org member by user id",
)
def get_member(
    org_id: str,
    user_id: str,
    current_org=Depends(get_current_org),
):
    if current_org["org_id"] != org_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Org access denied")

    if current_org["role"] not in {"owner", "admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")

    with db_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    m.org_id,
                    m.user_id,
                    m.role,
                    m.status,
                    m.created_at,
                    u.email
                FROM org_memberships m
                JOIN users u ON u.id = m.user_id
                WHERE m.org_id = %s AND m.user_id::text = %s
                """,
                (org_id, user_id),
            )
            membership = cur.fetchone()

    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return OrgMemberResponse(
        org_id=str(membership["org_id"]),
        user_id=str(membership["user_id"]),
        email=membership["email"],
        role=membership["role"],
        status=membership["status"],
        created_at=membership["created_at"].isoformat(),
    )
