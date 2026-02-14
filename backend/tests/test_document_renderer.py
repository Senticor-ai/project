"""Tests for the CV-to-PDF document renderer."""

from __future__ import annotations

import pytest

from app.document_renderer import render_cv_to_pdf

# WeasyPrint requires native Pango/GTK libraries that may not be installed
# in all CI environments.  Probe weasyprint directly (document_renderer
# imports it lazily) so we can skip the entire module when libs are missing.
try:
    import weasyprint  # noqa: F401
except (ImportError, OSError):
    pytest.skip(
        "WeasyPrint native libraries (pango) not available",
        allow_module_level=True,
    )

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

MINIMAL_CV = {
    "name": "Max Mustermann",
    "headline": "Software Engineer",
    "experience": [
        {
            "company": "ACME GmbH",
            "title": "Senior Developer",
            "period": "2020 - 2024",
            "bullets": ["Built microservices", "Led team of 4"],
        }
    ],
}

FULL_CV = {
    "name": "Erika Musterfrau",
    "contact": {
        "location": "Berlin",
        "phone": "+49 170 1234567",
        "email": "erika@example.com",
        "linkedin": "linkedin.com/in/erika",
    },
    "headline": "Product Manager & Technologist",
    "summary": "Experienced leader with 10+ years in tech.",
    "skills": ["Agile", "Python", "Product Strategy"],
    "experience": [
        {
            "company": "TechCo",
            "title": "VP Product",
            "period": "2021 - present",
            "location": "Remote",
            "summary": "Leading product org.",
            "bullets": ["Grew team from 5 to 20", "Launched 3 products"],
        },
        {
            "company": "StartupX",
            "title": "Product Lead",
            "period": "2018 - 2021",
            "bullets": ["First PM hire"],
        },
    ],
    "education": [
        {
            "institution": "TU Berlin",
            "degree": "M.Sc. Informatik",
            "period": "2012 - 2014",
        }
    ],
    "certifications": ["AWS Solutions Architect", "CSPO"],
}

SIMPLE_CSS = """
body {
  font-family: 'Inter', sans-serif;
}
h1 { font-size: 22pt; }
h2 { font-size: 14pt; margin-top: 12pt; border-bottom: 1px solid #ccc; }
"""


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestRenderCvToPdf:
    def test_returns_pdf_bytes(self):
        """Minimal CV produces valid PDF bytes."""
        result = render_cv_to_pdf(MINIMAL_CV, SIMPLE_CSS)
        assert isinstance(result, bytes)
        assert result[:5] == b"%PDF-"

    def test_pdf_size_reasonable(self):
        """PDF should be non-trivial but not huge."""
        result = render_cv_to_pdf(MINIMAL_CV, SIMPLE_CSS)
        assert len(result) > 1000  # Not empty
        assert len(result) < 500_000  # Not bloated

    def test_full_cv_renders(self):
        """Full CV with all sections renders successfully."""
        result = render_cv_to_pdf(FULL_CV, SIMPLE_CSS)
        assert result[:5] == b"%PDF-"

    def test_empty_css_still_works(self):
        """No custom CSS — base CSS alone should produce valid PDF."""
        result = render_cv_to_pdf(MINIMAL_CV, "")
        assert result[:5] == b"%PDF-"

    def test_cv_with_only_required_fields(self):
        """CV with just name, headline, experience (required fields)."""
        cv = {
            "name": "Test Person",
            "headline": "Tester",
            "experience": [{"title": "QA", "period": "2023"}],
        }
        result = render_cv_to_pdf(cv, "")
        assert result[:5] == b"%PDF-"

    def test_custom_font_in_css(self):
        """CSS referencing self-hosted Inter font doesn't crash."""
        css = """
        body { font-family: 'Inter', sans-serif; font-weight: 400; }
        h1 { font-weight: 700; }
        """
        result = render_cv_to_pdf(FULL_CV, css)
        assert result[:5] == b"%PDF-"

    def test_missing_optional_sections(self):
        """CV without education, certifications, skills, summary."""
        cv = {
            "name": "Sparse Person",
            "headline": "Minimalist",
            "experience": [{"title": "Worker", "company": "Co"}],
        }
        result = render_cv_to_pdf(cv, "")
        assert result[:5] == b"%PDF-"
