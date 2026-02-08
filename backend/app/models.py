from datetime import UTC, datetime
from enum import StrEnum
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


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


class ThingSourceMetadata(BaseModel):
    schemaVersion: int = Field(..., description="Metadata schema version.")
    provider: str = Field(..., description="Origin provider name, e.g. nirvana.")
    rawId: str = Field(..., description="Original provider item identifier.")
    rawType: int = Field(..., description="Original provider type code.")
    rawState: int = Field(..., description="Original provider state code.")
    raw: dict[str, Any] = Field(
        ...,
        description="Raw provider payload for high-fidelity round-tripping.",
    )


class TypedReferenceModel(BaseModel):
    type: str = Field(..., description="Reference relationship type.")
    targetId: str = Field(..., description="Canonical id of related entity.")
    note: str | None = Field(default=None, description="Optional reference note.")
    createdAt: str = Field(..., description="Reference creation timestamp (ISO-8601).")


class CaptureSourceThought(BaseModel):
    kind: Literal["thought"] = "thought"


class CaptureSourceEmail(BaseModel):
    kind: Literal["email"] = "email"
    subject: str | None = None
    from_: str | None = Field(default=None, alias="from")


class CaptureSourceMeeting(BaseModel):
    kind: Literal["meeting"] = "meeting"
    title: str | None = None
    date: str | None = None


class CaptureSourceVoice(BaseModel):
    kind: Literal["voice"] = "voice"
    transcript: str | None = None


class CaptureSourceImport(BaseModel):
    kind: Literal["import"] = "import"
    source: str = Field(..., description="Import source name.")


CaptureSourceModel = Annotated[
    (
        CaptureSourceThought
        | CaptureSourceEmail
        | CaptureSourceMeeting
        | CaptureSourceVoice
        | CaptureSourceImport
    ),
    Field(discriminator="kind"),
]


class ProvenanceEntryModel(BaseModel):
    timestamp: str = Field(..., description="Event timestamp (ISO-8601).")
    action: Literal[
        "created",
        "clarified",
        "moved",
        "updated",
        "archived",
        "enriched",
        "completed",
        "focused",
        "unfocused",
        "renamed",
    ] = Field(..., description="Mutation category.")
    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    note: str | None = None


class ProvenanceModel(BaseModel):
    createdAt: str = Field(..., description="Entity creation timestamp (ISO-8601).")
    updatedAt: str = Field(..., description="Entity update timestamp (ISO-8601).")
    archivedAt: str | None = Field(default=None, description="Entity archive timestamp.")
    history: list[ProvenanceEntryModel] = Field(
        default_factory=list,
        description="Chronological mutation history.",
    )


class DefinitionPortModel(BaseModel):
    kind: Literal["definition"] = "definition"
    doneCriteria: str = Field(..., description="Definition of done.")


class PredicatePortModel(BaseModel):
    kind: Literal["predicate"] = "predicate"
    conditions: list[str] = Field(default_factory=list, description="Start conditions.")


class ComputationPortModel(BaseModel):
    kind: Literal["computation"] = "computation"
    timeEstimate: (
        Literal[
            "5min",
            "15min",
            "30min",
            "1hr",
            "2hr",
            "half-day",
            "full-day",
        ]
        | None
    ) = Field(default=None, description="Estimated effort.")
    energyLevel: Literal["low", "medium", "high"] | None = Field(
        default=None,
        description="Estimated energy requirement.",
    )


class ChecklistItemModel(BaseModel):
    id: str = Field(..., description="Checklist item id.")
    text: str = Field(..., description="Checklist item text.")
    completed: bool = Field(..., description="Completion state.")
    completedAt: str | None = Field(default=None, description="Completion timestamp.")


class ProcedurePortModel(BaseModel):
    kind: Literal["procedure"] = "procedure"
    steps: list[ChecklistItemModel] = Field(default_factory=list, description="Procedure steps.")


PortModel = Annotated[
    DefinitionPortModel | PredicatePortModel | ComputationPortModel | ProcedurePortModel,
    Field(discriminator="kind"),
]


class RecurrenceDailyModel(BaseModel):
    kind: Literal["daily"] = "daily"
    interval: int = Field(..., ge=1)


class RecurrenceWeeklyModel(BaseModel):
    kind: Literal["weekly"] = "weekly"
    interval: int = Field(..., ge=1)
    daysOfWeek: list[int] = Field(default_factory=list, description="0=Sunday..6=Saturday")


class RecurrenceMonthlyModel(BaseModel):
    kind: Literal["monthly"] = "monthly"
    interval: int = Field(..., ge=1)
    dayOfMonth: int = Field(..., ge=1, le=31)


class RecurrenceYearlyModel(BaseModel):
    kind: Literal["yearly"] = "yearly"
    interval: int = Field(..., ge=1)
    month: int = Field(..., ge=1, le=12)
    day: int = Field(..., ge=1, le=31)


class RecurrenceAfterCompletionModel(BaseModel):
    kind: Literal["after_completion"] = "after_completion"
    interval: int = Field(..., ge=1)
    unit: Literal["days", "weeks", "months"]


RecurrenceModel = Annotated[
    (
        RecurrenceDailyModel
        | RecurrenceWeeklyModel
        | RecurrenceMonthlyModel
        | RecurrenceYearlyModel
        | RecurrenceAfterCompletionModel
    ),
    Field(discriminator="kind"),
]


def _default_iso_timestamp() -> str:
    return datetime.now(UTC).isoformat()


def _default_provenance() -> ProvenanceModel:
    now = _default_iso_timestamp()
    return ProvenanceModel(createdAt=now, updatedAt=now, history=[])


class PropertyValueModel(BaseModel):
    """Schema.org PropertyValue for additionalProperty entries."""

    type: Literal["PropertyValue"] = Field(
        default="PropertyValue",
        alias="@type",
        description="JSON-LD type (always PropertyValue).",
    )
    propertyID: str = Field(
        ...,
        description="Property identifier, e.g. app:bucket.",
    )
    value: Any = Field(
        ...,
        description="Property value (type varies by propertyID).",
    )

    model_config = ConfigDict(populate_by_name=True)


class ThingJsonLdBase(BaseModel):
    """Base schema.org JSON-LD model (v2).

    Direct schema.org properties live at the top level.
    App-specific properties live in ``additionalProperty`` as PropertyValue entries.
    """

    id: str = Field(..., alias="@id", description="Canonical JSON-LD id (urn:app:…).")
    type: str = Field(..., alias="@type", description="Schema.org JSON-LD type.")
    schemaVersion: int = Field(
        default=2,
        alias="_schemaVersion",
        description="Domain schema version for this record.",
    )
    name: str | None = Field(
        default=None,
        description="Optional deliberate name (schema.org name).",
    )
    description: str | None = Field(default=None, description="Long-form description.")
    keywords: list[str] = Field(
        default_factory=list,
        description="Free-form tags (schema.org keywords).",
    )
    dateCreated: str | None = Field(
        default=None,
        description="Creation timestamp (ISO-8601).",
    )
    dateModified: str | None = Field(
        default=None,
        description="Last-modified timestamp (ISO-8601).",
    )
    additionalProperty: list[PropertyValueModel] = Field(
        default_factory=list,
        description="App-specific properties as schema.org PropertyValue entries.",
    )
    sourceMetadata: ThingSourceMetadata | None = Field(
        default=None,
        description="Provider-specific source metadata preserved during imports.",
    )

    model_config = ConfigDict(populate_by_name=True, extra="allow")


class InboxThingJsonLd(ThingJsonLdBase):
    """schema:Thing — unclarified inbox capture."""

    type: Literal["Thing"] = Field(
        ...,
        alias="@type",
        description="schema.org Thing (inbox item).",
    )


class ActionThingJsonLd(ThingJsonLdBase):
    """schema:Action — next/waiting/calendar/someday action."""

    type: Literal["Action"] = Field(..., alias="@type", description="schema.org Action.")
    startTime: str | None = Field(
        default=None,
        description="Scheduled date/time (schema.org startTime).",
    )
    endTime: str | None = Field(
        default=None,
        description="Completion timestamp (schema.org endTime).",
    )
    isPartOf: dict[str, str] | None = Field(
        default=None,
        description='Owning project reference, e.g. {"@id": "urn:app:project:…"}.',
    )


class ProjectThingJsonLd(ThingJsonLdBase):
    """schema:Project — multi-step outcome."""

    type: Literal["Project"] = Field(..., alias="@type", description="schema.org Project.")
    endTime: str | None = Field(
        default=None,
        description="Completion timestamp (schema.org endTime).",
    )
    hasPart: list[dict[str, str]] = Field(
        default_factory=list,
        description='Child action references, e.g. [{"@id": "urn:app:action:…"}].',
    )


class ReferenceThingJsonLd(ThingJsonLdBase):
    """schema:CreativeWork — reference material."""

    type: Literal["CreativeWork"] = Field(
        ...,
        alias="@type",
        description="schema.org CreativeWork.",
    )
    url: str | None = Field(default=None, description="External URL.")
    encodingFormat: str | None = Field(
        default=None,
        description="MIME type (schema.org encodingFormat).",
    )


ThingJsonLd = Annotated[
    InboxThingJsonLd | ActionThingJsonLd | ProjectThingJsonLd | ReferenceThingJsonLd,
    Field(discriminator="type"),
]


class ThingPatchModel(BaseModel):
    """Partial JSON-LD for PATCH deep-merge (v2 schema.org format)."""

    id: str | None = Field(default=None, alias="@id", description="Canonical id (immutable).")
    type: Literal["Thing", "Action", "Project", "CreativeWork"] | None = Field(
        default=None,
        alias="@type",
        description="Schema.org type override.",
    )
    schemaVersion: int | None = Field(default=None, alias="_schemaVersion")
    name: str | None = None
    description: str | None = None
    keywords: list[str] | None = None
    dateCreated: str | None = None
    dateModified: str | None = None
    startTime: str | None = None
    endTime: str | None = None
    isPartOf: dict[str, str] | None = None
    hasPart: list[dict[str, str]] | None = None
    url: str | None = None
    encodingFormat: str | None = None
    additionalProperty: list[PropertyValueModel] | None = None
    sourceMetadata: ThingSourceMetadata | None = None

    model_config = ConfigDict(populate_by_name=True, extra="allow")


class ThingCreateRequest(BaseModel):
    source: str = "manual"
    thing: ThingJsonLd = Field(..., description="JSON-LD GTD object.")


class ThingPatchRequest(BaseModel):
    source: str | None = None
    name_source: str | None = Field(
        default=None,
        description="Provenance hint for name changes (e.g. 'AI suggested from rawCapture').",
    )
    thing: ThingPatchModel = Field(
        ...,
        description="Partial JSON-LD GTD object to deep-merge.",
    )


class ThingResponse(BaseModel):
    thing_id: str
    canonical_id: str
    source: str
    thing: ThingJsonLd
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


class ImportSource(StrEnum):
    NIRVANA = "nirvana"


class ImportJobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class NirvanaImportRequest(BaseModel):
    items: list[dict[str, Any]] = Field(
        ...,
        description="Raw Nirvana export item list.",
        min_length=1,
    )
    source: ImportSource = Field(
        default=ImportSource.NIRVANA,
        description="Import source identifier.",
    )
    dry_run: bool = Field(
        default=False,
        description="Validate and summarize only; do not write database changes.",
    )
    update_existing: bool = Field(
        default=True,
        description="Update existing records when canonical IDs already exist.",
    )
    include_completed: bool = Field(
        default=True,
        description="Include completed Nirvana items in the import.",
    )
    emit_events: bool = Field(
        default=True,
        description="Emit outbox events for downstream indexing/notifications.",
    )
    state_bucket_map: dict[int, str] | None = Field(
        default=None,
        description=(
            "Optional override map from Nirvana state integer to internal bucket "
            "(for example 1->next, 2->waiting)."
        ),
    )
    default_bucket: str = Field(
        default="inbox",
        description="Fallback bucket when no state mapping applies.",
        examples=["inbox"],
    )


class NirvanaImportSummary(BaseModel):
    total: int = Field(..., description="Total number of input items processed.")
    created: int = Field(..., description="Number of new things created.")
    updated: int = Field(..., description="Number of existing things updated.")
    unchanged: int = Field(0, description="Items with identical content (no update needed).")
    skipped: int = Field(..., description="Number of items skipped (duplicates/filtered).")
    errors: int = Field(..., description="Number of items that failed import.")
    bucket_counts: dict[str, int] = Field(
        default_factory=dict,
        description="Counts by target bucket.",
    )
    sample_errors: list[str] = Field(
        default_factory=list,
        description="Sample error messages (truncated set).",
    )
    completed_counts: dict[str, int] = Field(
        default_factory=dict,
        description="Per-bucket count of items that are completed (have endTime).",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "total": 7,
                    "created": 7,
                    "updated": 0,
                    "skipped": 0,
                    "errors": 0,
                    "bucket_counts": {
                        "project": 1,
                        "next": 1,
                        "waiting": 1,
                        "calendar": 2,
                        "someday": 1,
                        "inbox": 1,
                    },
                    "completed_counts": {
                        "next": 1,
                    },
                    "sample_errors": [],
                }
            ]
        }
    )


class NirvanaImportInspectRequest(BaseModel):
    file_id: str = Field(
        ...,
        description="Uploaded file identifier returned by `/files/complete`.",
        examples=["8b9d7e3a-7b8b-4b8d-9b6c-8cf7e6d7d111"],
    )
    source: ImportSource = Field(
        default=ImportSource.NIRVANA,
        description="Import source identifier.",
    )
    update_existing: bool = Field(
        default=True,
        description="Whether existing records should be updated.",
    )
    include_completed: bool = Field(
        default=True,
        description="Whether completed items are included in validation/import preview.",
    )
    state_bucket_map: dict[int, str] | None = Field(
        default=None,
        description="Optional override map from Nirvana state integer to internal bucket.",
    )
    default_bucket: str = Field(
        default="inbox",
        description="Fallback bucket when no state mapping applies.",
    )


class NirvanaImportFromFileRequest(BaseModel):
    file_id: str = Field(
        ...,
        description="Uploaded file identifier returned by `/files/complete`.",
        examples=["8b9d7e3a-7b8b-4b8d-9b6c-8cf7e6d7d111"],
    )
    source: ImportSource = Field(
        default=ImportSource.NIRVANA,
        description="Import source identifier.",
    )
    update_existing: bool = Field(
        default=True,
        description="Whether existing records should be updated.",
    )
    include_completed: bool = Field(
        default=True,
        description="Whether completed items should be imported.",
    )
    emit_events: bool = Field(
        default=True,
        description="Emit outbox events for downstream indexing/notifications.",
    )
    state_bucket_map: dict[int, str] | None = Field(
        default=None,
        description="Optional override map from Nirvana state integer to internal bucket.",
    )
    default_bucket: str = Field(
        default="inbox",
        description="Fallback bucket when no state mapping applies.",
    )


class ImportJobResponse(BaseModel):
    job_id: str = Field(..., description="Import job identifier (UUID).")
    status: ImportJobStatus = Field(
        ...,
        description="Current job status.",
    )
    file_id: str = Field(..., description="File identifier being imported.")
    file_sha256: str | None = Field(
        default=None,
        description="SHA-256 hash of the imported file (for duplicate detection).",
    )
    source: ImportSource = Field(..., description="Import source identifier.")
    created_at: datetime = Field(..., description="Job creation timestamp (UTC).")
    updated_at: datetime = Field(..., description="Last status update timestamp (UTC).")
    started_at: datetime | None = Field(
        default=None,
        description="Worker start timestamp (UTC).",
    )
    finished_at: datetime | None = Field(
        default=None,
        description="Worker completion timestamp (UTC).",
    )
    summary: NirvanaImportSummary | None = Field(
        default=None,
        description="Import summary, present when completed.",
    )
    error: str | None = Field(
        default=None,
        description="Failure details, present when status is `failed`.",
    )

    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "job_id": "2851209e-3a01-4684-8fae-dd27db05e0aa",
                    "status": "running",
                    "file_id": "8b9d7e3a-7b8b-4b8d-9b6c-8cf7e6d7d111",
                    "source": "nirvana",
                    "created_at": "2026-02-07T11:14:42.778617Z",
                    "updated_at": "2026-02-07T11:14:43.101903Z",
                    "started_at": "2026-02-07T11:14:43.101820Z",
                    "finished_at": None,
                    "summary": None,
                    "error": None,
                },
                {
                    "job_id": "2851209e-3a01-4684-8fae-dd27db05e0aa",
                    "status": "completed",
                    "file_id": "8b9d7e3a-7b8b-4b8d-9b6c-8cf7e6d7d111",
                    "source": "nirvana",
                    "created_at": "2026-02-07T11:14:42.778617Z",
                    "updated_at": "2026-02-07T11:14:44.190500Z",
                    "started_at": "2026-02-07T11:14:43.101820Z",
                    "finished_at": "2026-02-07T11:14:44.190499Z",
                    "summary": {
                        "total": 7,
                        "created": 7,
                        "updated": 0,
                        "skipped": 0,
                        "errors": 0,
                        "bucket_counts": {
                            "project": 1,
                            "next": 1,
                            "waiting": 1,
                            "calendar": 2,
                            "someday": 1,
                            "inbox": 1,
                        },
                        "sample_errors": [],
                    },
                    "error": None,
                },
            ]
        }
    )
