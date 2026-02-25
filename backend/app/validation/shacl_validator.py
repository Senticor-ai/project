"""SHACL validation wrapper using pyshacl library."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from pyshacl import validate
from rdflib import Graph

logger = logging.getLogger(__name__)

# Load shapes graph at module initialization
_SHAPES_PATH = Path(__file__).parent / "shapes" / "entities.ttl"
_shapes_graph: Graph | None = None


def _load_shapes() -> Graph:
    """Load SHACL shapes from entities.ttl file."""
    global _shapes_graph
    if _shapes_graph is not None:
        return _shapes_graph

    try:
        shapes = Graph()
        shapes.parse(_SHAPES_PATH, format="turtle")
        _shapes_graph = shapes
        logger.info(f"Loaded SHACL shapes from {_SHAPES_PATH}")
        return shapes
    except Exception as e:
        logger.error(f"Failed to load SHACL shapes from {_SHAPES_PATH}: {e}")
        raise RuntimeError(f"SHACL shapes loading failed: {e}") from e


def _parse_violation_report(report_graph: Graph, report_text: str) -> list[dict[str, Any]]:
    """Parse SHACL validation report into structured violations list.

    Args:
        report_graph: RDF graph containing validation report
        report_text: Human-readable report text

    Returns:
        List of violation dicts with keys: source, code, field, message
    """
    violations: list[dict[str, Any]] = []

    # Query the report graph for validation results
    query = """
    PREFIX sh: <http://www.w3.org/ns/shacl#>

    SELECT ?result ?focusNode ?path ?message ?severity ?value
    WHERE {
        ?report a sh:ValidationReport ;
                sh:result ?result .
        ?result sh:focusNode ?focusNode ;
                sh:resultSeverity ?severity .
        OPTIONAL { ?result sh:resultPath ?path }
        OPTIONAL { ?result sh:resultMessage ?message }
        OPTIONAL { ?result sh:value ?value }
    }
    """

    try:
        results = report_graph.query(query)

        for row in results:
            path_str = str(row.path) if row.path else "item"
            # Extract local name from URI for cleaner field names
            if "#" in path_str:
                path_str = path_str.split("#")[-1]
            elif "/" in path_str:
                path_str = path_str.split("/")[-1]

            message = str(row.message) if row.message else "Validation constraint violated"

            # Generate code from path or use generic code
            code = (
                f"SHACL_{path_str.upper()}_CONSTRAINT"
                if path_str != "item"
                else "SHACL_CONSTRAINT"
            )

            violations.append({
                "source": "shacl",
                "code": code,
                "field": path_str,
                "message": message,
            })
    except Exception as e:
        logger.warning(f"Failed to parse SHACL report graph: {e}")
        # Fallback: parse text report for at least one violation
        if report_text and "Validation Report" in report_text:
            violations.append({
                "source": "shacl",
                "code": "SHACL_VALIDATION_FAILED",
                "field": "item",
                "message": "SHACL validation failed. See details in report.",
            })

    return violations


def validate_shacl(
    data_graph: Graph,
    abort_on_first: bool = False,
) -> list[dict[str, Any]]:
    """Validate RDF data graph against SHACL shapes.

    Args:
        data_graph: RDF graph containing data to validate
        abort_on_first: If True, stop on first violation (CLI fail-fast).
                       If False, collect all violations (backend behavior).

    Returns:
        List of violation dicts. Empty list if validation passes.
        Each violation has keys: source, code, field, message

    Raises:
        RuntimeError: If shapes cannot be loaded
    """
    shapes = _load_shapes()

    try:
        conforms, report_graph, report_text = validate(
            data_graph,
            shacl_graph=shapes,
            inference="rdfs",
            abort_on_first=abort_on_first,
        )

        if conforms:
            return []

        violations = _parse_violation_report(report_graph, report_text)
        return violations

    except Exception as e:
        logger.error(f"SHACL validation error: {e}")
        # Return a generic validation error rather than raising
        return [{
            "source": "shacl",
            "code": "SHACL_VALIDATION_ERROR",
            "field": "item",
            "message": f"SHACL validation failed: {str(e)}",
        }]
