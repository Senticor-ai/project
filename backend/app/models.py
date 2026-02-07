from typing import Any

from pydantic import BaseModel, Field


class AuthCredentials(BaseModel):
    email: str
    password: str


class RegistrationRequest(BaseModel):
    email: str
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    username: str | None = None
    default_org_id: str | None = None
    created_at: str


class SessionRefreshResponse(BaseModel):
    user: UserResponse
    expires_at: str
    refresh_expires_at: str


class ThingCreateRequest(BaseModel):
    source: str = "manual"
    thing: dict[str, Any] = Field(..., description="JSON-LD object")


class ThingPatchRequest(BaseModel):
    source: str | None = None
    thing: dict[str, Any] = Field(..., description="Partial JSON-LD object to deep-merge")


class ThingResponse(BaseModel):
    thing_id: str
    canonical_id: str
    source: str
    thing: dict[str, Any]
    content_hash: str | None = None
    created_at: str
    updated_at: str


class AssertionCreateRequest(BaseModel):
    thing_id: str
    assertion_type: str
    payload: dict[str, Any]
    actor_type: str
    actor_id: str
    otel_trace_id: str | None = None
    supersedes_assertion_id: str | None = None


class SyncResponse(BaseModel):
    items: list[ThingResponse]
    next_cursor: str | None = None
    has_more: bool
    server_time: str


class FileInitiateRequest(BaseModel):
    filename: str
    content_type: str | None = None
    total_size: int


class FileInitiateResponse(BaseModel):
    upload_id: str
    upload_url: str
    chunk_size: int
    chunk_total: int
    expires_at: str


class FileCompleteRequest(BaseModel):
    upload_id: str


class FileRecord(BaseModel):
    file_id: str
    original_name: str
    content_type: str | None = None
    size_bytes: int
    sha256: str
    created_at: str
    download_url: str


class FileMetaResponse(BaseModel):
    file_id: str
    original_name: str
    content_type: str | None = None
    size_bytes: int
    sha256: str
    created_at: str
    download_url: str


class SearchIndexStatusResponse(BaseModel):
    org_id: str
    entity_type: str
    entity_id: str
    action: str
    status: str
    attempts: int
    last_error: str | None = None
    queued_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    updated_at: str | None = None


class PushSubscriptionRequest(BaseModel):
    subscription: dict[str, Any]


class PushNotificationRequest(BaseModel):
    title: str
    body: str
    url: str | None = None
    target_user_id: str | None = None


class PushPublicKeyResponse(BaseModel):
    public_key: str


class OrgCreateRequest(BaseModel):
    name: str


class OrgResponse(BaseModel):
    id: str
    name: str
    role: str | None = None
    created_at: str


class OrgMemberAddRequest(BaseModel):
    email: str
    role: str | None = None


class OrgMemberResponse(BaseModel):
    org_id: str
    user_id: str
    email: str
    role: str
    status: str
    created_at: str


class NirvanaImportRequest(BaseModel):
    items: list[dict[str, Any]]
    source: str = "nirvana"
    dry_run: bool = False
    update_existing: bool = True
    include_completed: bool = True
    emit_events: bool = True
    state_bucket_map: dict[int, str] | None = None
    default_bucket: str = "inbox"


class NirvanaImportSummary(BaseModel):
    total: int
    created: int
    updated: int
    skipped: int
    errors: int
    bucket_counts: dict[str, int] = Field(default_factory=dict)
    sample_errors: list[str] = Field(default_factory=list)


class NirvanaImportInspectRequest(BaseModel):
    file_id: str
    source: str = "nirvana"
    update_existing: bool = True
    include_completed: bool = True
    state_bucket_map: dict[int, str] | None = None
    default_bucket: str = "inbox"


class NirvanaImportFromFileRequest(BaseModel):
    file_id: str
    source: str = "nirvana"
    update_existing: bool = True
    include_completed: bool = True
    emit_events: bool = True
    state_bucket_map: dict[int, str] | None = None
    default_bucket: str = "inbox"


class ImportJobResponse(BaseModel):
    job_id: str
    status: str
    file_id: str
    source: str
    created_at: str
    updated_at: str
    started_at: str | None = None
    finished_at: str | None = None
    summary: dict[str, Any] | None = None
    error: str | None = None
