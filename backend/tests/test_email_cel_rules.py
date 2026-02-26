"""Unit tests for CEL rule catalog used by Gmail sync + proposal behavior."""

from __future__ import annotations

import pytest

from app.email.cel_rules import _load_rules, evaluate_rule

pytestmark = pytest.mark.unit


def test_email_cel_rules_load_and_have_unique_ids():
    rules = _load_rules()
    assert rules
    rule_ids = list(rules.keys())
    assert len(rule_ids) == len(set(rule_ids))


def test_sync_importable_rule_blocks_non_inbox_messages():
    allows = evaluate_rule(
        "sync.gmail.message.importable",
        {
            "operation": "sync.gmail.message.importable",
            "message": {"has_inbox_label": True},
        },
        default=False,
    )
    blocks = evaluate_rule(
        "sync.gmail.message.importable",
        {
            "operation": "sync.gmail.message.importable",
            "message": {"has_inbox_label": False},
        },
        default=True,
    )

    assert allows is True
    assert blocks is False


def test_proposal_detection_rules():
    reschedule = evaluate_rule(
        "proposal.detect.reschedule",
        {
            "operation": "proposal.detect",
            "email": {"has_reschedule_keyword": True},
            "calendar": {"has_candidate_event": True},
        },
        default=False,
    )
    schedule = evaluate_rule(
        "proposal.detect.schedule",
        {
            "operation": "proposal.detect",
            "email": {"has_schedule_keyword": True},
        },
        default=False,
    )
    pickup = evaluate_rule(
        "proposal.detect.pickup",
        {
            "operation": "proposal.detect",
            "email": {"has_pickup_keyword": True},
        },
        default=False,
    )

    assert reschedule is True
    assert schedule is True
    assert pickup is True


def test_proposal_urgency_and_confirmation_rules():
    urgent_by_window = evaluate_rule(
        "proposal.urgency.reschedule",
        {
            "operation": "proposal.urgency.reschedule",
            "calendar": {"starts_within_urgent_window": True},
        },
        default=False,
    )
    urgent_by_keyword = evaluate_rule(
        "proposal.urgency.keyword",
        {
            "operation": "proposal.urgency.keyword",
            "email": {"has_urgent_keyword": True},
        },
        default=False,
    )
    requires_confirmation = evaluate_rule(
        "proposal.confirmation.required",
        {
            "operation": "proposal.confirmation.required",
            "proposal": {"has_google_write_action": True},
        },
        default=False,
    )

    assert urgent_by_window is True
    assert urgent_by_keyword is True
    assert requires_confirmation is True
