"""Pydantic models for copilot.v1 CLI contract envelope.

# CLI Contract Specification (copilot_cli)

The copilot_cli contract defines a stable command-line interface and response
envelope schema for SDK consumers. This contract ensures predictable behavior,
type safety, and version stability across all agent tool invocations.

## 1. Command Invocation Contract

### 1.1 argv[] Structure

Commands are invoked with a required string array of arguments:

    argv = ["<command>", "<subcommand>", "<arg1>", "<arg2>", ...]

Examples:
    argv = ["items", "list"]
    argv = ["items", "create", "--title", "Task name"]
    argv = ["items", "update", "123", "--bucket", "next"]

SDK consumers must provide argv[] as a list of strings. The tool executor
automatically normalizes and validates command structure before execution.

### 1.2 Auto-Added Flags

The tool executor automatically adds required flags to ensure consistent behavior:

- `--json`: Forces structured JSON output conforming to copilot.v1 envelope
- `--non-interactive`: Disables interactive prompts (required for agent execution)
- `--approve`: Auto-added for write operations requiring user approval

These flags are idempotent — if already present in argv[], they are not duplicated.

Example transformation:
    Input:  argv = ["items", "create", "--title", "Task"]
    Output: ["items", "create", "--title", "Task", "--json", "--non-interactive", "--approve"]

### 1.3 Approval-Gated Write Operations

Write operations (create, update, delete, archive) require explicit approval:

- In agent context: `--approve` is auto-added by the tool executor
- In interactive CLI: User is prompted for confirmation unless `--approve` provided
- In CI/non-interactive mode: `--approve` must be present or command fails

This ensures audit trails and prevents unauthorized modifications.

### 1.4 Exit Code Contract

Commands follow standard Unix exit code conventions:

- Exit code 0: Command succeeded (copilot.v1 success envelope returned)
- Exit code ≠ 0: Command failed (copilot.v1 error envelope returned)

SDK consumers must check exit codes before parsing JSON output.

## 2. Response Envelope Contract (copilot.v1)

All CLI responses conform to the copilot.v1 envelope schema with discriminated
union types for success/error cases.

### 2.1 Success Envelope

Returned when command executes successfully (exit code 0):

    {
        "schema_version": "copilot.v1",
        "ok": true,
        "data": <operation-specific result>,
        "meta": {
            "execution_time_ms": 123,
            "conversation_id": "conv-abc"
        }
    }

Fields:
- `schema_version`: Always "copilot.v1" (enforced via Literal type)
- `ok`: Always true for success case (discriminator field)
- `data`: Operation-specific result (items list, created item, etc.)
- `meta`: Optional metadata (timing, request context, etc.)

### 2.2 Error Envelope

Returned when command fails (exit code ≠ 0):

    {
        "schema_version": "copilot.v1",
        "ok": false,
        "error": {
            "code": "INVALID_BUCKET",
            "message": "Bucket 'invalid' does not exist"
        },
        "meta": {
            "execution_time_ms": 45,
            "conversation_id": "conv-abc"
        }
    }

Fields:
- `schema_version`: Always "copilot.v1" (enforced via Literal type)
- `ok`: Always false for error case (discriminator field)
- `error.code`: Machine-readable error code (uppercase snake_case)
- `error.message`: Human-readable error message
- `meta`: Optional metadata (timing, request context, etc.)

### 2.3 Error Codes

Common error codes returned by copilot_cli:

- `INVALID_BUCKET`: Unknown bucket name provided
- `ITEM_NOT_FOUND`: Item ID does not exist
- `VALIDATION_ERROR`: Invalid command arguments or data
- `APPROVAL_REQUIRED`: Write operation needs --approve flag
- `EXECUTION_ERROR`: Unexpected internal error during execution

## 3. Version Stability Guarantees

### 3.1 Backward Compatibility

Within a schema version (e.g., "copilot.v1"), the envelope structure is stable:

- Field names will not change
- Field types will not change
- Required fields will not be removed
- New optional fields may be added

SDK consumers can rely on envelope shape stability within a version.

### 3.2 Breaking Changes

Breaking changes require a new schema version (e.g., "copilot.v2"):

- Field removals → new version
- Field type changes → new version
- Required field additions → new version
- Envelope structure changes → new version

Old versions continue to be supported during deprecation period.

### 3.3 Version Enforcement

Pydantic models enforce version constraints at runtime:

- CopilotV1Success/Error: schema_version must equal "copilot.v1"
- Field validators reject unknown versions
- Pydantic validation errors surface version mismatches

## 4. Usage Examples

### 4.1 List Items

Command:
    argv = ["items", "list", "--bucket", "inbox"]

Success Response:
    {
        "schema_version": "copilot.v1",
        "ok": true,
        "data": {
            "items": [
                {"id": "123", "title": "Task 1", "bucket": "inbox"},
                {"id": "124", "title": "Task 2", "bucket": "inbox"}
            ]
        },
        "meta": {}
    }

### 4.2 Create Item

Command:
    argv = ["items", "create", "--title", "New task", "--bucket", "next"]

Success Response:
    {
        "schema_version": "copilot.v1",
        "ok": true,
        "data": {
            "item": {"id": "125", "title": "New task", "bucket": "next"}
        },
        "meta": {}
    }

### 4.3 Error Case

Command:
    argv = ["items", "update", "999", "--bucket", "invalid"]

Error Response:
    {
        "schema_version": "copilot.v1",
        "ok": false,
        "error": {
            "code": "INVALID_BUCKET",
            "message": "Bucket 'invalid' does not exist. Valid buckets: inbox, next, waiting, someday, calendar"
        },
        "meta": {}
    }

## 5. SDK Consumer Guidelines

### 5.1 Parsing Responses

SDK consumers should:

1. Check exit code first (0 = success, ≠ 0 = error)
2. Parse stdout as JSON
3. Validate schema_version matches expected version
4. Use `ok` field to discriminate success/error envelopes
5. Extract data from `data` or `error` fields based on `ok` value

### 5.2 Error Handling

SDK consumers should:

- Check exit codes before parsing JSON
- Handle both validation errors (bad envelope structure) and execution errors
- Log error.code for debugging and monitoring
- Display error.message to end users
- Implement retry logic for transient errors (network, timeout)

### 5.3 Version Migration

When a new schema version is released:

1. Update SDK to parse both old and new versions
2. Check schema_version field to route to correct parser
3. Migrate gradually (support both versions during transition)
4. Remove old version support after deprecation period

## 6. Type Safety

This module provides Pydantic models for type-safe envelope handling:

- `CopilotV1Success`: Success envelope model (ok=True)
- `CopilotV1Error`: Error envelope model (ok=False)
- `CopilotV1ErrorDetail`: Structured error details (code, message)
- `CopilotV1Envelope`: Discriminated union (Success | Error)

Use these models to parse and validate CLI responses with full type checking.
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
