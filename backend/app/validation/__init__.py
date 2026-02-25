"""Validation package for SHACL + CEL and item-level validation."""


def validate_item_create(item: dict) -> list[dict[str, object]]:
    from .item_validator import validate_item_create as _validate_item_create

    return _validate_item_create(item)


def validate_item_update(
    existing_item: dict,
    next_item: dict,
) -> list[dict[str, object]]:
    from .item_validator import validate_item_update as _validate_item_update

    return _validate_item_update(existing_item, next_item)


def raise_if_invalid(
    issues: list[dict[str, object]],
    default_message: str = "Validation failed",
) -> None:
    from .item_validator import raise_if_invalid as _raise_if_invalid

    _raise_if_invalid(issues, default_message)


__all__ = ["raise_if_invalid", "validate_item_create", "validate_item_update"]
