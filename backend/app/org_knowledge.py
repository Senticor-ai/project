from __future__ import annotations

from typing import Any

from .db import jsonb


def create_org_knowledge_documents(
    cur: Any,
    *,
    org_id: Any,
    created_by_user_id: Any,
) -> dict[str, Any]:
    """Create default org knowledge docs and attach their IDs to organizations."""
    doc_ids: dict[str, Any] = {}
    for doc_type in ("general", "user", "log", "agent"):
        canonical_id = f"org:{org_id}:knowledge:{doc_type}"
        cur.execute(
            """
            INSERT INTO items (
                org_id, created_by_user_id, canonical_id, schema_jsonld, source
            )
            VALUES (%s, %s, %s, %s, %s)
            RETURNING item_id
            """,
            (
                org_id,
                created_by_user_id,
                canonical_id,
                jsonb(
                    {
                        "@id": canonical_id,
                        "@type": "DigitalDocument",
                        "_schemaVersion": 2,
                        "name": f"Organization {doc_type.title()} Knowledge",
                        "encodingFormat": "text/markdown",
                        "text": "",
                    }
                ),
                "system",
            ),
        )
        row = cur.fetchone()
        if row is None:
            raise RuntimeError("Failed to create org knowledge document")
        doc_ids[doc_type] = row["item_id"]

    cur.execute(
        """
        UPDATE organizations
        SET general_doc_id = %s, user_doc_id = %s, log_doc_id = %s, agent_doc_id = %s
        WHERE id = %s
        """,
        (doc_ids["general"], doc_ids["user"], doc_ids["log"], doc_ids["agent"], org_id),
    )

    return doc_ids
