from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from ..db import db_conn, jsonb
from ..deps import get_current_org, get_current_user

CANONICAL_STATUS_LABELS: dict[str, str] = {
    "PotentialActionStatus": "Backlog",
    "ActiveActionStatus": "In Progress",
    "CompletedActionStatus": "Done",
    "FailedActionStatus": "Blocked",
}
DEFAULT_STATUS = "PotentialActionStatus"
DEFAULT_DONE_STATUSES = ["CompletedActionStatus"]
DEFAULT_BLOCKED_STATUSES = ["FailedActionStatus"]


class WorkflowTransitionModel(BaseModel):
    from_status: str
    to_status: str


class WorkflowDefinitionResponse(BaseModel):
    policy_mode: str
    default_status: str
    done_statuses: list[str]
    blocked_statuses: list[str]
    canonical_statuses: list[str]
    column_labels: dict[str, str]
    transitions: list[WorkflowTransitionModel]


class ProjectMemberAddRequest(BaseModel):
    email: str
    role: str = "member"


class ProjectMemberResponse(BaseModel):
    project_id: str
    user_id: str
    email: str
    role: str
    is_owner: bool
    added_at: str
    added_by: str | None = None


class ProjectMemberDeleteResponse(BaseModel):
    ok: bool
    project_id: str
    user_id: str


class ActionCommentResponse(BaseModel):
    id: str
    action_id: str
    author_id: str
    parent_comment_id: str | None = None
    body: str
    created_at: str
    updated_at: str


class ActionRevisionResponse(BaseModel):
    id: int
    action_id: str
    actor_id: str
    diff: dict[str, Any]
    created_at: str


class ActionTransitionEventResponse(BaseModel):
    id: int
    action_id: str
    ts: str
    actor_id: str
    from_status: str | None = None
    to_status: str
    reason: str | None = None
    payload: dict[str, Any]
    correlation_id: str | None = None


class ProjectActionResponse(BaseModel):
    id: str
    canonical_id: str
    project_id: str
    name: str
    description: str | None = None
    action_status: str
    owner_user_id: str | None = None
    owner_text: str | None = None
    due_at: str | None = None
    tags: list[str] = Field(default_factory=list)
    object_ref: dict[str, Any] | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    created_at: str
    updated_at: str
    last_event_id: int | None = None
    comment_count: int = 0


class ProjectActionDetailResponse(ProjectActionResponse):
    comments: list[ActionCommentResponse] = Field(default_factory=list)
    revisions: list[ActionRevisionResponse] = Field(default_factory=list)


class ProjectActionHistoryResponse(BaseModel):
    transitions: list[ActionTransitionEventResponse] = Field(default_factory=list)
    revisions: list[ActionRevisionResponse] = Field(default_factory=list)


class ProjectActionCreateRequest(BaseModel):
    canonical_id: str | None = None
    name: str
    description: str | None = None
    action_status: str | None = None
    owner_user_id: str | None = None
    owner_text: str | None = None
    due_at: datetime | None = None
    tags: list[str] = Field(default_factory=list)
    object_ref: dict[str, Any] | None = None
    attributes: dict[str, Any] = Field(default_factory=dict)
    correlation_id: str | None = None


class ProjectActionUpdateRequest(BaseModel):
    name: str | None = None
    description: str | None = None
    owner_user_id: str | None = None
    owner_text: str | None = None
    due_at: datetime | None = None
    tags: list[str] | None = None
    object_ref: dict[str, Any] | None = None
    attributes: dict[str, Any] | None = None


class ProjectActionTransitionRequest(BaseModel):
    to_status: str
    reason: str | None = None
    payload: dict[str, Any] | None = None
    correlation_id: str | None = None
    expected_last_event_id: int | None = None


class ProjectActionCommentCreateRequest(BaseModel):
    body: str
    parent_comment_id: str | None = None


router = APIRouter(
    prefix="/projects",
    tags=["collaboration"],
    dependencies=[Depends(get_current_user)],
)


def _iso(value: Any) -> str:
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    raise TypeError("datetime expected")


def _jsonable(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.astimezone(UTC).isoformat()
    return str(value) if hasattr(value, "hex") else value


def _parse_type_tokens(type_value: Any) -> list[str]:
    if isinstance(type_value, str):
        return [type_value]
    if isinstance(type_value, list):
        return [entry for entry in type_value if isinstance(entry, str)]
    return []


def _is_project_type(type_value: Any) -> bool:
    for token in _parse_type_tokens(type_value):
        if token.split(":")[-1] == "Project":
            return True
    return False


def _normalize_tags(tags: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in tags:
        value = raw.strip()
        if not value:
            continue
        if value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _normalize_status(value: str, allowed: set[str]) -> str:
    candidate = value.strip()
    if candidate not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Unsupported action status: {value}",
        )
    return candidate


def _serialize_comment_row(row: dict[str, Any]) -> ActionCommentResponse:
    return ActionCommentResponse(
        id=str(row["id"]),
        action_id=str(row["action_id"]),
        author_id=str(row["author_id"]),
        parent_comment_id=str(row["parent_comment_id"]) if row["parent_comment_id"] else None,
        body=row["body"],
        created_at=_iso(row["created_at"]),
        updated_at=_iso(row["updated_at"]),
    )


def _serialize_revision_row(row: dict[str, Any]) -> ActionRevisionResponse:
    return ActionRevisionResponse(
        id=int(row["id"]),
        action_id=str(row["action_id"]),
        actor_id=str(row["actor_id"]),
        diff=row["diff"] if isinstance(row["diff"], dict) else {},
        created_at=_iso(row["created_at"]),
    )


def _serialize_transition_row(row: dict[str, Any]) -> ActionTransitionEventResponse:
    payload = row["payload"] if isinstance(row["payload"], dict) else {}
    return ActionTransitionEventResponse(
        id=int(row["id"]),
        action_id=str(row["action_id"]),
        ts=_iso(row["ts"]),
        actor_id=str(row["actor_id"]),
        from_status=row["from_status"],
        to_status=row["to_status"],
        reason=row["reason"],
        payload=payload,
        correlation_id=row["correlation_id"],
    )


def _serialize_action_row(row: dict[str, Any], project_id: str) -> ProjectActionResponse:
    tags = row["tags"] if isinstance(row.get("tags"), list) else []
    attributes = row["attributes"] if isinstance(row.get("attributes"), dict) else {}
    object_ref = row["object_ref"] if isinstance(row.get("object_ref"), dict) else None
    effective_status = row.get("projected_status") or row.get("action_status")
    if not isinstance(effective_status, str):
        effective_status = DEFAULT_STATUS

    return ProjectActionResponse(
        id=str(row["id"]),
        canonical_id=row["canonical_id"],
        project_id=project_id,
        name=row["name"],
        description=row["description"],
        action_status=effective_status,
        owner_user_id=str(row["owner_user_id"]) if row.get("owner_user_id") else None,
        owner_text=row.get("owner_text"),
        due_at=_iso(row["due_at"]) if row.get("due_at") else None,
        tags=tags,
        object_ref=object_ref,
        attributes=attributes,
        created_at=_iso(row["created_at"]),
        updated_at=_iso(row["updated_at"]),
        last_event_id=int(row["last_event_id"]) if row.get("last_event_id") is not None else None,
        comment_count=int(row.get("comment_count") or 0),
    )


def _resolve_project_access(
    cur,
    *,
    org_id: str,
    project_id: str,
    user_id: str,
    org_role: str,
    require_owner: bool = False,
) -> tuple[dict[str, Any], str, str | None]:
    cur.execute(
        """
        SELECT item_id, canonical_id, created_by_user_id, schema_jsonld, created_at
        FROM items
        WHERE org_id = %s
          AND archived_at IS NULL
          AND (canonical_id = %s OR item_id::text = %s)
        LIMIT 1
        """,
        (org_id, project_id, project_id),
    )
    project = cur.fetchone()
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    jsonld = project["schema_jsonld"] if isinstance(project.get("schema_jsonld"), dict) else {}
    if not _is_project_type(jsonld.get("@type")):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")

    owner_id = str(project["created_by_user_id"]) if project.get("created_by_user_id") else None
    member_role: str | None = None

    if owner_id and owner_id == user_id:
        member_role = "owner"
    elif owner_id is None and org_role in {"owner", "admin"}:
        member_role = "owner"
    else:
        cur.execute(
            """
            SELECT role
            FROM project_member
            WHERE project_item_id = %s AND user_id::text = %s
            """,
            (project["item_id"], user_id),
        )
        row = cur.fetchone()
        if row and isinstance(row.get("role"), str):
            member_role = row["role"]

    if member_role is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Project access denied")
    if require_owner and member_role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only project owner can manage collaborators",
        )

    return project, member_role, owner_id


def _ensure_default_workflow(cur, project_item_id: str) -> None:
    cur.execute(
        """
        INSERT INTO project_workflow (
            project_item_id,
            policy_mode,
            default_status,
            done_statuses,
            blocked_statuses
        )
        VALUES (%s, 'open', %s, %s, %s)
        ON CONFLICT (project_item_id) DO NOTHING
        """,
        (
            project_item_id,
            DEFAULT_STATUS,
            jsonb(DEFAULT_DONE_STATUSES),
            jsonb(DEFAULT_BLOCKED_STATUSES),
        ),
    )

    for index, (status_value, label) in enumerate(CANONICAL_STATUS_LABELS.items()):
        cur.execute(
            """
            INSERT INTO workflow_state (
                project_item_id,
                canonical_status,
                column_label,
                position,
                is_default,
                is_done,
                is_blocked
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (project_item_id, canonical_status) DO NOTHING
            """,
            (
                project_item_id,
                status_value,
                label,
                index,
                status_value == DEFAULT_STATUS,
                status_value in DEFAULT_DONE_STATUSES,
                status_value in DEFAULT_BLOCKED_STATUSES,
            ),
        )

    for from_status in CANONICAL_STATUS_LABELS:
        for to_status in CANONICAL_STATUS_LABELS:
            if from_status == to_status:
                continue
            cur.execute(
                """
                INSERT INTO workflow_transition (project_item_id, from_status, to_status)
                VALUES (%s, %s, %s)
                ON CONFLICT (project_item_id, from_status, to_status) DO NOTHING
                """,
                (project_item_id, from_status, to_status),
            )


def _get_workflow_definition(cur, project_item_id: str) -> WorkflowDefinitionResponse:
    _ensure_default_workflow(cur, project_item_id)

    cur.execute(
        """
        SELECT policy_mode, default_status, done_statuses, blocked_statuses
        FROM project_workflow
        WHERE project_item_id = %s
        """,
        (project_item_id,),
    )
    policy = cur.fetchone()
    if policy is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Workflow policy unavailable",
        )

    cur.execute(
        """
        SELECT canonical_status, column_label, position
        FROM workflow_state
        WHERE project_item_id = %s
        ORDER BY position ASC
        """,
        (project_item_id,),
    )
    states = cur.fetchall()

    cur.execute(
        """
        SELECT from_status, to_status
        FROM workflow_transition
        WHERE project_item_id = %s
        ORDER BY from_status, to_status
        """,
        (project_item_id,),
    )
    transitions = cur.fetchall()

    canonical_statuses: list[str] = [row["canonical_status"] for row in states]
    column_labels = {row["canonical_status"]: row["column_label"] for row in states}

    done_statuses = [
        value
        for value in (policy["done_statuses"] if isinstance(policy["done_statuses"], list) else [])
        if isinstance(value, str)
    ]
    blocked_statuses = [
        value
        for value in (
            policy["blocked_statuses"] if isinstance(policy["blocked_statuses"], list) else []
        )
        if isinstance(value, str)
    ]

    return WorkflowDefinitionResponse(
        policy_mode=policy["policy_mode"],
        default_status=policy["default_status"],
        done_statuses=done_statuses,
        blocked_statuses=blocked_statuses,
        canonical_statuses=canonical_statuses,
        column_labels=column_labels,
        transitions=[
            WorkflowTransitionModel(from_status=row["from_status"], to_status=row["to_status"])
            for row in transitions
        ],
    )


def _resolve_user_in_org(cur, org_id: str, user_id: str):
    cur.execute(
        """
        SELECT m.user_id
        FROM org_memberships m
        WHERE m.org_id = %s
          AND m.user_id::text = %s
          AND m.status = 'active'
        """,
        (org_id, user_id),
    )
    membership = cur.fetchone()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="owner_user_id must belong to the project org",
        )
    return membership["user_id"]


def _load_action_or_404(
    cur,
    *,
    org_id: str,
    project_item_id: str,
    action_id: str,
) -> dict[str, Any]:
    cur.execute(
        """
        SELECT
            a.*,
            p.status AS projected_status,
            p.last_event_id,
            COALESCE(comment_counts.comment_count, 0) AS comment_count
        FROM project_action a
        LEFT JOIN action_state_projection p ON p.action_id = a.id
        LEFT JOIN LATERAL (
            SELECT count(*)::integer AS comment_count
            FROM action_comment c
            WHERE c.action_id = a.id
        ) AS comment_counts ON TRUE
        WHERE a.org_id = %s
          AND a.project_item_id = %s
          AND a.id::text = %s
          AND a.archived_at IS NULL
        """,
        (org_id, project_item_id, action_id),
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Action not found",
        )
    return row


def _validate_transition(
    workflow: WorkflowDefinitionResponse,
    from_status: str,
    to_status: str,
) -> None:
    allowed = set(workflow.canonical_statuses)
    _normalize_status(from_status, allowed)
    _normalize_status(to_status, allowed)

    if workflow.policy_mode == "open":
        return

    transition_pairs = {(row.from_status, row.to_status) for row in workflow.transitions}
    if (from_status, to_status) not in transition_pairs:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "INVALID_TRANSITION",
                "message": f"Transition {from_status} -> {to_status} is not allowed",
            },
        )


@router.get(
    "/{project_id}/workflow",
    response_model=WorkflowDefinitionResponse,
    summary="Get workflow definition for a project",
)
def get_project_workflow(
    project_id: str,
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    user_id = str(current_user["id"])

    with db_conn() as conn:
        with conn.cursor() as cur:
            project, _, _ = _resolve_project_access(
                cur,
                org_id=org_id,
                project_id=project_id,
                user_id=user_id,
                org_role=current_org["role"],
            )
            workflow = _get_workflow_definition(cur, str(project["item_id"]))
        conn.commit()

    return workflow


@router.get(
    "/{project_id}/members",
    response_model=list[ProjectMemberResponse],
    summary="List project collaborators",
)
def list_project_members(
    project_id: str,
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    user_id = str(current_user["id"])

    with db_conn() as conn:
        with conn.cursor() as cur:
            project, _, owner_id = _resolve_project_access(
                cur,
                org_id=org_id,
                project_id=project_id,
                user_id=user_id,
                org_role=current_org["role"],
            )

            members: list[ProjectMemberResponse] = []
            if owner_id:
                cur.execute("SELECT id, email FROM users WHERE id::text = %s", (owner_id,))
                owner_row = cur.fetchone()
                if owner_row:
                    members.append(
                        ProjectMemberResponse(
                            project_id=project["canonical_id"],
                            user_id=str(owner_row["id"]),
                            email=owner_row["email"],
                            role="owner",
                            is_owner=True,
                            added_at=_iso(project["created_at"]),
                            added_by=None,
                        )
                    )

            cur.execute(
                """
                SELECT pm.user_id, u.email, pm.role, pm.added_at, pm.added_by
                FROM project_member pm
                JOIN users u ON u.id = pm.user_id
                WHERE pm.project_item_id = %s
                ORDER BY pm.added_at ASC
                """,
                (project["item_id"],),
            )
            for row in cur.fetchall():
                target_user_id = str(row["user_id"])
                if owner_id and target_user_id == owner_id:
                    continue
                members.append(
                    ProjectMemberResponse(
                        project_id=project["canonical_id"],
                        user_id=target_user_id,
                        email=row["email"],
                        role=row["role"],
                        is_owner=False,
                        added_at=_iso(row["added_at"]),
                        added_by=str(row["added_by"]) if row["added_by"] else None,
                    )
                )

    return members


@router.post(
    "/{project_id}/members",
    response_model=ProjectMemberResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a collaborator to a project",
)
def add_project_member(
    project_id: str,
    payload: ProjectMemberAddRequest,
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    user_id = str(current_user["id"])

    email = payload.email.strip().lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Email is required",
        )

    role = payload.role.strip().lower()
    if role != "member":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Only 'member' role is supported in MVP",
        )

    with db_conn() as conn:
        with conn.cursor() as cur:
            project, _, owner_id = _resolve_project_access(
                cur,
                org_id=org_id,
                project_id=project_id,
                user_id=user_id,
                org_role=current_org["role"],
                require_owner=True,
            )

            cur.execute("SELECT id, email FROM users WHERE LOWER(email) = LOWER(%s)", (email,))
            invited = cur.fetchone()
            if invited is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="User is not registered. Ask them to register first.",
                )

            invited_id = str(invited["id"])
            if owner_id and invited_id == owner_id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Project owner is already a collaborator",
                )

            cur.execute(
                """
                INSERT INTO org_memberships (org_id, user_id, role, status)
                VALUES (%s, %s, 'member', 'active')
                ON CONFLICT (org_id, user_id)
                DO UPDATE SET status = 'active', updated_at = now()
                """,
                (org_id, invited["id"]),
            )

            cur.execute(
                """
                INSERT INTO project_member (project_item_id, user_id, role, added_by)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (project_item_id, user_id)
                DO UPDATE
                SET role = EXCLUDED.role,
                    added_at = now(),
                    added_by = EXCLUDED.added_by
                RETURNING project_item_id, user_id, role, added_at, added_by
                """,
                (project["item_id"], invited["id"], role, current_user["id"]),
            )
            row = cur.fetchone()
        conn.commit()

    if row is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to add project member",
        )

    return ProjectMemberResponse(
        project_id=project["canonical_id"],
        user_id=str(row["user_id"]),
        email=invited["email"],
        role=row["role"],
        is_owner=False,
        added_at=_iso(row["added_at"]),
        added_by=str(row["added_by"]) if row["added_by"] else None,
    )


@router.delete(
    "/{project_id}/members/{target_user_id}",
    response_model=ProjectMemberDeleteResponse,
    summary="Remove a collaborator from a project",
)
def remove_project_member(
    project_id: str,
    target_user_id: str,
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    user_id = str(current_user["id"])

    with db_conn() as conn:
        with conn.cursor() as cur:
            project, _, owner_id = _resolve_project_access(
                cur,
                org_id=org_id,
                project_id=project_id,
                user_id=user_id,
                org_role=current_org["role"],
                require_owner=True,
            )

            if owner_id and target_user_id == owner_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Project owner cannot be removed",
                )

            cur.execute(
                """
                DELETE FROM project_member
                WHERE project_item_id = %s AND user_id::text = %s
                RETURNING user_id
                """,
                (project["item_id"], target_user_id),
            )
            deleted = cur.fetchone()
        conn.commit()

    if deleted is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project member not found",
        )

    return ProjectMemberDeleteResponse(
        ok=True,
        project_id=project["canonical_id"],
        user_id=str(deleted["user_id"]),
    )


@router.get(
    "/{project_id}/actions",
    response_model=list[ProjectActionResponse],
    summary="List actions for a project",
)
def list_project_actions(
    project_id: str,
    status_filter: list[str] | None = Query(default=None, alias="status"),
    tag: str | None = Query(default=None),
    owner_user_id: str | None = Query(default=None),
    due_before: datetime | None = Query(default=None),
    due_after: datetime | None = Query(default=None),
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    user_id = str(current_user["id"])

    statuses = [
        _normalize_status(value, set(CANONICAL_STATUS_LABELS.keys()))
        for value in (status_filter or [])
    ]

    with db_conn() as conn:
        with conn.cursor() as cur:
            project, _, _ = _resolve_project_access(
                cur,
                org_id=org_id,
                project_id=project_id,
                user_id=user_id,
                org_role=current_org["role"],
            )

            where_clauses = [
                "a.org_id = %s",
                "a.project_item_id = %s",
                "a.archived_at IS NULL",
            ]
            params: list[Any] = [org_id, project["item_id"]]

            if statuses:
                where_clauses.append("COALESCE(p.status, a.action_status) = ANY(%s)")
                params.append(statuses)

            if tag is not None and tag.strip():
                where_clauses.append("a.tags @> %s")
                params.append(jsonb([tag.strip()]))

            if owner_user_id is not None and owner_user_id.strip():
                where_clauses.append("a.owner_user_id::text = %s")
                params.append(owner_user_id.strip())

            if due_before is not None:
                where_clauses.append("a.due_at <= %s")
                params.append(due_before)

            if due_after is not None:
                where_clauses.append("a.due_at >= %s")
                params.append(due_after)

            where_sql = " AND ".join(where_clauses)
            cur.execute(
                f"""
                SELECT
                    a.*,
                    p.status AS projected_status,
                    p.last_event_id,
                    COALESCE(comment_counts.comment_count, 0) AS comment_count
                FROM project_action a
                LEFT JOIN action_state_projection p ON p.action_id = a.id
                LEFT JOIN LATERAL (
                    SELECT count(*)::integer AS comment_count
                    FROM action_comment c
                    WHERE c.action_id = a.id
                ) AS comment_counts ON TRUE
                WHERE {where_sql}
                ORDER BY a.due_at ASC NULLS LAST, a.created_at ASC
                """,
                tuple(params),
            )
            rows = cur.fetchall()

    return [_serialize_action_row(row, project["canonical_id"]) for row in rows]


@router.post(
    "/{project_id}/actions",
    response_model=ProjectActionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an action in a project",
)
def create_project_action(
    project_id: str,
    payload: ProjectActionCreateRequest,
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    user_id = str(current_user["id"])

    name = payload.name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Action name is required",
        )

    tags = _normalize_tags(payload.tags)
    canonical_id = payload.canonical_id or f"urn:app:action:{uuid.uuid4()}"

    with db_conn() as conn:
        with conn.cursor() as cur:
            project, _, _ = _resolve_project_access(
                cur,
                org_id=org_id,
                project_id=project_id,
                user_id=user_id,
                org_role=current_org["role"],
            )

            workflow = _get_workflow_definition(cur, str(project["item_id"]))
            status_value = payload.action_status or workflow.default_status
            status_value = _normalize_status(status_value, set(workflow.canonical_statuses))

            owner_user_value = None
            if payload.owner_user_id is not None and payload.owner_user_id.strip():
                owner_user_value = _resolve_user_in_org(cur, org_id, payload.owner_user_id.strip())

            cur.execute(
                """
                INSERT INTO project_action (
                    org_id,
                    project_item_id,
                    canonical_id,
                    name,
                    description,
                    action_status,
                    owner_user_id,
                    owner_text,
                    due_at,
                    tags,
                    object_ref,
                    attributes,
                    created_by
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (org_id, canonical_id) DO NOTHING
                RETURNING *
                """,
                (
                    org_id,
                    project["item_id"],
                    canonical_id,
                    name,
                    payload.description,
                    status_value,
                    owner_user_value,
                    payload.owner_text,
                    payload.due_at,
                    jsonb(tags),
                    jsonb(payload.object_ref) if payload.object_ref is not None else None,
                    jsonb(payload.attributes),
                    current_user["id"],
                ),
            )
            created = cur.fetchone()

            if created is None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Conflict: canonical_id already exists",
                )

            cur.execute(
                """
                INSERT INTO action_transition_event (
                    action_id,
                    actor_id,
                    from_status,
                    to_status,
                    reason,
                    payload,
                    correlation_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    created["id"],
                    current_user["id"],
                    None,
                    status_value,
                    "created",
                    jsonb({"source": "createAction"}),
                    payload.correlation_id,
                ),
            )
            event = cur.fetchone()

            cur.execute(
                """
                INSERT INTO action_state_projection (action_id, status, last_event_id)
                VALUES (%s, %s, %s)
                ON CONFLICT (action_id)
                DO UPDATE SET
                    status = EXCLUDED.status,
                    updated_at = now(),
                    last_event_id = EXCLUDED.last_event_id
                """,
                (created["id"], status_value, event["id"] if event else None),
            )
        conn.commit()

    if event:
        created["projected_status"] = status_value
        created["last_event_id"] = event["id"]
    created["comment_count"] = 0
    return _serialize_action_row(created, project["canonical_id"])


@router.patch(
    "/{project_id}/actions/{action_id}",
    response_model=ProjectActionResponse,
    summary="Update action fields",
)
def update_project_action(
    project_id: str,
    action_id: str,
    payload: ProjectActionUpdateRequest,
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    user_id = str(current_user["id"])

    updates = payload.model_dump(exclude_unset=True)

    with db_conn() as conn:
        with conn.cursor() as cur:
            project, _, _ = _resolve_project_access(
                cur,
                org_id=org_id,
                project_id=project_id,
                user_id=user_id,
                org_role=current_org["role"],
            )
            existing = _load_action_or_404(
                cur,
                org_id=org_id,
                project_item_id=str(project["item_id"]),
                action_id=action_id,
            )

            if not updates:
                return _serialize_action_row(existing, project["canonical_id"])

            new_name = existing["name"]
            if "name" in updates:
                candidate = updates["name"]
                if candidate is None or not str(candidate).strip():
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="Action name cannot be empty",
                    )
                new_name = str(candidate).strip()

            new_description = (
                updates["description"]
                if "description" in updates
                else existing["description"]
            )

            new_owner_user_id = existing["owner_user_id"]
            if "owner_user_id" in updates:
                value = updates["owner_user_id"]
                if value is None or not str(value).strip():
                    new_owner_user_id = None
                else:
                    new_owner_user_id = _resolve_user_in_org(cur, org_id, str(value).strip())

            new_owner_text = (
                updates["owner_text"] if "owner_text" in updates else existing["owner_text"]
            )
            new_due_at = updates["due_at"] if "due_at" in updates else existing["due_at"]

            new_tags = existing["tags"] if isinstance(existing["tags"], list) else []
            if "tags" in updates:
                value = updates["tags"]
                new_tags = _normalize_tags(value if isinstance(value, list) else [])

            new_object_ref = (
                existing["object_ref"] if isinstance(existing["object_ref"], dict) else None
            )
            if "object_ref" in updates:
                value = updates["object_ref"]
                new_object_ref = value if isinstance(value, dict) else None

            new_attributes = (
                existing["attributes"] if isinstance(existing["attributes"], dict) else {}
            )
            if "attributes" in updates:
                value = updates["attributes"]
                new_attributes = value if isinstance(value, dict) else {}

            cur.execute(
                """
                UPDATE project_action
                SET
                    name = %s,
                    description = %s,
                    owner_user_id = %s,
                    owner_text = %s,
                    due_at = %s,
                    tags = %s,
                    object_ref = %s,
                    attributes = %s,
                    updated_at = now()
                WHERE id = %s
                RETURNING *
                """,
                (
                    new_name,
                    new_description,
                    new_owner_user_id,
                    new_owner_text,
                    new_due_at,
                    jsonb(new_tags),
                    jsonb(new_object_ref) if new_object_ref is not None else None,
                    jsonb(new_attributes),
                    existing["id"],
                ),
            )
            updated = cur.fetchone()

            if updated is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Action not found",
                )

            diff: dict[str, Any] = {}
            tracked_fields = {
                "name": (existing["name"], new_name),
                "description": (existing["description"], new_description),
                "owner_user_id": (existing["owner_user_id"], new_owner_user_id),
                "owner_text": (existing["owner_text"], new_owner_text),
                "due_at": (existing["due_at"], new_due_at),
                "tags": (
                    existing["tags"] if isinstance(existing["tags"], list) else [],
                    new_tags,
                ),
                "object_ref": (
                    existing["object_ref"] if isinstance(existing["object_ref"], dict) else None,
                    new_object_ref,
                ),
                "attributes": (
                    existing["attributes"] if isinstance(existing["attributes"], dict) else {},
                    new_attributes,
                ),
            }
            for field_name, (old_value, new_value) in tracked_fields.items():
                if old_value != new_value:
                    diff[field_name] = {
                        "from": _jsonable(old_value),
                        "to": _jsonable(new_value),
                    }

            if diff:
                cur.execute(
                    """
                    INSERT INTO action_revision (action_id, actor_id, diff)
                    VALUES (%s, %s, %s)
                    """,
                    (existing["id"], current_user["id"], jsonb(diff)),
                )
        conn.commit()

    updated["projected_status"] = existing.get("projected_status")
    updated["last_event_id"] = existing.get("last_event_id")
    updated["comment_count"] = existing.get("comment_count")
    return _serialize_action_row(updated, project["canonical_id"])


@router.post(
    "/{project_id}/actions/{action_id}/transition",
    response_model=ProjectActionResponse,
    summary="Transition action status",
)
def transition_project_action(
    project_id: str,
    action_id: str,
    payload: ProjectActionTransitionRequest,
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    user_id = str(current_user["id"])

    with db_conn() as conn:
        with conn.cursor() as cur:
            project, _, _ = _resolve_project_access(
                cur,
                org_id=org_id,
                project_id=project_id,
                user_id=user_id,
                org_role=current_org["role"],
            )
            workflow = _get_workflow_definition(cur, str(project["item_id"]))
            to_status = _normalize_status(payload.to_status, set(workflow.canonical_statuses))

            existing = _load_action_or_404(
                cur,
                org_id=org_id,
                project_item_id=str(project["item_id"]),
                action_id=action_id,
            )
            from_status = existing.get("projected_status") or existing["action_status"]

            expected_last = payload.expected_last_event_id
            current_last = existing.get("last_event_id")
            if expected_last is not None and expected_last != current_last:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail={
                        "code": "STALE_TRANSITION",
                        "message": "Action status changed by another update",
                        "expected_last_event_id": expected_last,
                        "current_last_event_id": current_last,
                    },
                )

            if to_status == from_status:
                return _serialize_action_row(existing, project["canonical_id"])

            _validate_transition(workflow, from_status, to_status)

            cur.execute(
                """
                INSERT INTO action_transition_event (
                    action_id,
                    actor_id,
                    from_status,
                    to_status,
                    reason,
                    payload,
                    correlation_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    existing["id"],
                    current_user["id"],
                    from_status,
                    to_status,
                    payload.reason,
                    jsonb(payload.payload) if payload.payload is not None else jsonb({}),
                    payload.correlation_id,
                ),
            )
            event = cur.fetchone()

            cur.execute(
                """
                UPDATE project_action
                SET action_status = %s, updated_at = now()
                WHERE id = %s
                """,
                (to_status, existing["id"]),
            )

            cur.execute(
                """
                INSERT INTO action_state_projection (action_id, status, updated_at, last_event_id)
                VALUES (%s, %s, now(), %s)
                ON CONFLICT (action_id)
                DO UPDATE SET
                    status = EXCLUDED.status,
                    updated_at = EXCLUDED.updated_at,
                    last_event_id = EXCLUDED.last_event_id
                """,
                (existing["id"], to_status, event["id"]),
            )

            cur.execute(
                """
                INSERT INTO action_revision (action_id, actor_id, diff)
                VALUES (%s, %s, %s)
                """,
                (
                    existing["id"],
                    current_user["id"],
                    jsonb(
                        {
                            "action_status": {
                                "from": from_status,
                                "to": to_status,
                                "reason": payload.reason,
                            }
                        }
                    ),
                ),
            )

            updated = _load_action_or_404(
                cur,
                org_id=org_id,
                project_item_id=str(project["item_id"]),
                action_id=action_id,
            )
        conn.commit()

    return _serialize_action_row(updated, project["canonical_id"])


@router.post(
    "/{project_id}/actions/{action_id}/comments",
    response_model=ActionCommentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add a comment to an action",
)
def add_action_comment(
    project_id: str,
    action_id: str,
    payload: ProjectActionCommentCreateRequest,
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    user_id = str(current_user["id"])

    body = payload.body.strip()
    if not body:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Comment body is required",
        )

    with db_conn() as conn:
        with conn.cursor() as cur:
            project, _, _ = _resolve_project_access(
                cur,
                org_id=org_id,
                project_id=project_id,
                user_id=user_id,
                org_role=current_org["role"],
            )
            action = _load_action_or_404(
                cur,
                org_id=org_id,
                project_item_id=str(project["item_id"]),
                action_id=action_id,
            )

            parent_comment_id = payload.parent_comment_id
            if parent_comment_id is not None:
                cur.execute(
                    """
                    SELECT id
                    FROM action_comment
                    WHERE id::text = %s AND action_id = %s
                    """,
                    (parent_comment_id, action["id"]),
                )
                parent = cur.fetchone()
                if parent is None:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Parent comment not found",
                    )

            cur.execute(
                """
                INSERT INTO action_comment (
                    action_id,
                    author_id,
                    parent_comment_id,
                    body
                )
                VALUES (%s, %s, %s, %s)
                RETURNING *
                """,
                (action["id"], current_user["id"], parent_comment_id, body),
            )
            created = cur.fetchone()
        conn.commit()

    if created is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create comment",
        )

    return _serialize_comment_row(created)


@router.get(
    "/{project_id}/actions/{action_id}",
    response_model=ProjectActionDetailResponse,
    summary="Get action detail with comments and revisions",
)
def get_project_action_detail(
    project_id: str,
    action_id: str,
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    user_id = str(current_user["id"])

    with db_conn() as conn:
        with conn.cursor() as cur:
            project, _, _ = _resolve_project_access(
                cur,
                org_id=org_id,
                project_id=project_id,
                user_id=user_id,
                org_role=current_org["role"],
            )
            action = _load_action_or_404(
                cur,
                org_id=org_id,
                project_item_id=str(project["item_id"]),
                action_id=action_id,
            )

            cur.execute(
                """
                SELECT id, action_id, author_id, parent_comment_id, body, created_at, updated_at
                FROM action_comment
                WHERE action_id = %s
                ORDER BY created_at ASC
                """,
                (action["id"],),
            )
            comment_rows = cur.fetchall()

            cur.execute(
                """
                SELECT id, action_id, actor_id, diff, created_at
                FROM action_revision
                WHERE action_id = %s
                ORDER BY created_at ASC
                """,
                (action["id"],),
            )
            revision_rows = cur.fetchall()

    base = _serialize_action_row(action, project["canonical_id"])
    return ProjectActionDetailResponse(
        **base.model_dump(),
        comments=[_serialize_comment_row(row) for row in comment_rows],
        revisions=[_serialize_revision_row(row) for row in revision_rows],
    )


@router.get(
    "/{project_id}/actions/{action_id}/history",
    response_model=ProjectActionHistoryResponse,
    summary="List action transition and revision history",
)
def list_project_action_history(
    project_id: str,
    action_id: str,
    current_org=Depends(get_current_org),
    current_user=Depends(get_current_user),
):
    org_id = current_org["org_id"]
    user_id = str(current_user["id"])

    with db_conn() as conn:
        with conn.cursor() as cur:
            project, _, _ = _resolve_project_access(
                cur,
                org_id=org_id,
                project_id=project_id,
                user_id=user_id,
                org_role=current_org["role"],
            )
            action = _load_action_or_404(
                cur,
                org_id=org_id,
                project_item_id=str(project["item_id"]),
                action_id=action_id,
            )

            cur.execute(
                """
                SELECT
                    id,
                    action_id,
                    ts,
                    actor_id,
                    from_status,
                    to_status,
                    reason,
                    payload,
                    correlation_id
                FROM action_transition_event
                WHERE action_id = %s
                ORDER BY id ASC
                """,
                (action["id"],),
            )
            transition_rows = cur.fetchall()

            cur.execute(
                """
                SELECT id, action_id, actor_id, diff, created_at
                FROM action_revision
                WHERE action_id = %s
                ORDER BY id ASC
                """,
                (action["id"],),
            )
            revision_rows = cur.fetchall()

    return ProjectActionHistoryResponse(
        transitions=[_serialize_transition_row(row) for row in transition_rows],
        revisions=[_serialize_revision_row(row) for row in revision_rows],
    )
