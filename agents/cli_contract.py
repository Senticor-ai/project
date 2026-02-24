"""Pydantic models for copilot.v1 CLI contract envelope.

The copilot_cli contract defines a stable success/error envelope schema
for SDK consumers. All CLI responses conform to the copilot.v1 envelope:

Success response:
    {
        "schema_version": "copilot.v1",
        "ok": true,
        "data": {...},
        "meta": {}
    }

Error response:
    {
        "schema_version": "copilot.v1",
        "ok": false,
        "error": {"code": "...", "message": "..."},
        "meta": {}
    }

CLI contract enforcement:
- `argv[]`: Required string array of command arguments
- `--json`: Auto-added for structured output
- `--non-interactive`: Auto-added to disable prompts
- `--approve` / `--yes`: Required for approval-gated write operations
- Exit code 0 for success, non-zero for failure

Version stability:
- schema_version "copilot.v1" is enforced via Literal types
- Breaking changes require new version (copilot.v2)
- Clients can rely on envelope shape stability within a version
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class CopilotV1ErrorDetail(BaseModel):
    """Error detail structure within the copilot.v1 error envelope."""

    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error message")


class CopilotV1Success(BaseModel):
    """copilot.v1 success response envelope.

    Returned when CLI command executes successfully. The `data` field
    contains operation-specific results (created items, lists, etc.).
    """

    schema_version: Literal["copilot.v1"] = Field(
        "copilot.v1", description="Envelope schema version"
    )
    ok: Literal[True] = Field(True, description="Success discriminator")
    data: Any = Field(..., description="Operation-specific result data")
    meta: dict[str, Any] = Field(default_factory=dict, description="Metadata (e.g., timing)")

    @field_validator("schema_version")
    @classmethod
    def validate_version(cls, v: str) -> str:
        """Enforce copilot.v1 version — reject unknown versions."""
        if v != "copilot.v1":
            raise ValueError(f"Unsupported schema_version: {v}")
        return v


class CopilotV1Error(BaseModel):
    """copilot.v1 error response envelope.

    Returned when CLI command fails. The `error` field contains structured
    error details (code, message) for programmatic error handling.
    """

    schema_version: Literal["copilot.v1"] = Field(
        "copilot.v1", description="Envelope schema version"
    )
    ok: Literal[False] = Field(False, description="Error discriminator")
    error: CopilotV1ErrorDetail = Field(..., description="Structured error details")
    meta: dict[str, Any] = Field(default_factory=dict, description="Metadata (e.g., timing)")

    @field_validator("schema_version")
    @classmethod
    def validate_version(cls, v: str) -> str:
        """Enforce copilot.v1 version — reject unknown versions."""
        if v != "copilot.v1":
            raise ValueError(f"Unsupported schema_version: {v}")
        return v


# Discriminated union for success/error envelopes
CopilotV1Envelope = CopilotV1Success | CopilotV1Error
