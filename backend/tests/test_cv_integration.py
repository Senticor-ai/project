"""Integration test — CV pipeline through text extraction and PDF rendering.

Uses inline test fixtures (not external files) so tests run in CI without
any personal documents in the repository.
"""

from __future__ import annotations

import pytest

from app.text_extractor import extract_file_text

# WeasyPrint requires native Pango/GTK libraries that may not be installed
# in all CI environments.  Skip PDF-rendering tests gracefully when absent.
# Note: document_renderer imports weasyprint lazily inside functions, so
# importing render_cv_to_pdf alone won't trigger the OSError.  We probe
# weasyprint directly to detect missing native libs.
try:
    import weasyprint  # noqa: F401

    _HAS_WEASYPRINT = True
except (ImportError, OSError):
    _HAS_WEASYPRINT = False

from app.document_renderer import render_cv_to_pdf

requires_weasyprint = pytest.mark.skipif(
    not _HAS_WEASYPRINT,
    reason="WeasyPrint native libraries (pango) not available",
)

# ---------------------------------------------------------------------------
# Inline fixtures — generic persona, no personal data
# ---------------------------------------------------------------------------

SAMPLE_CV_MARKDOWN = """\
# John Johnson

**Senior Product Manager & Cloud Architect**

Springfield, USA | +1-555-0100 | john@snakeoil.example.com

## Profile

Results-driven product leader with 15+ years of experience in cloud platforms,
developer tools, and enterprise SaaS. Track record of shipping products that
delight developers and generate measurable business impact.

## Skills

- Cloud Architecture (AWS, Azure, GCP)
- Product Strategy & Roadmapping
- Cross-functional Team Leadership
- Developer Experience (DX)
- Agile & Scrum

## Experience

### Head of Product — Snake Oil Inc.

*2022 – Present | Remote*

- Launched 3 new API products generating $4M increase in ARR
- Established product-led growth motion with 30% MoM developer sign-ups
- Led cross-functional team of 12 engineers, 2 designers, 1 data analyst

### Senior Product Manager — Acme Corp

*2017 – 2022 | New York, NY*

- Drove cloud migration strategy reducing infrastructure costs by 40%
- Spearheaded developer portal serving 50k monthly active users
- Increased platform uptime from 99.9% to 99.99%

### Product Manager — Widgets Ltd.

*2012 – 2017 | Chicago, IL*

- Managed product lifecycle for 5 B2B SaaS products
- Grew annual recurring revenue from $2M to $8M

## Education

- **BSc Computer Science** — Springfield University (2011)
- **MBA** — State Business School (2015)

## Certifications

- AWS Solutions Architect Professional
- Certified Scrum Product Owner (CSPO)
"""

SAMPLE_JOB_HTML = """\
<!DOCTYPE html>
<html>
<head><title>Product Manager - Snake Oil Inc.</title></head>
<body>
<h1>Product Manager, Developer Platform</h1>
<p><strong>Snake Oil Inc.</strong> — Springfield, USA</p>
<h2>About the Role</h2>
<p>We are looking for a Product Manager to lead our Developer Platform team.
You will own the roadmap for our API products, developer portal, and SDK ecosystem.</p>
<h2>Requirements</h2>
<ul>
<li>5+ years of product management experience</li>
<li>Experience with developer tools or platform products</li>
<li>Strong technical background (CS degree or equivalent)</li>
<li>Excellent communication and stakeholder management skills</li>
</ul>
<h2>Nice to Have</h2>
<ul>
<li>Experience with cloud infrastructure (AWS, Azure, GCP)</li>
<li>Background in API design and developer experience</li>
</ul>
</body>
</html>
"""


class TestTextExtraction:
    """Verify text extraction works on markdown and HTML content."""

    def test_extract_cv_markdown(self, tmp_path):
        cv_file = tmp_path / "cv.md"
        cv_file.write_text(SAMPLE_CV_MARKDOWN)
        text = extract_file_text(cv_file, "text/markdown", max_chars=50000)
        assert len(text) > 500
        assert "John Johnson" in text
        assert "Snake Oil" in text
        assert "Acme Corp" in text
        assert "Product Manager" in text

    def test_extract_job_description_html(self, tmp_path):
        job_file = tmp_path / "job.html"
        job_file.write_text(SAMPLE_JOB_HTML)
        text = extract_file_text(job_file, "text/html", max_chars=50000)
        assert len(text) > 200
        assert "Snake Oil" in text
        assert "Developer Platform" in text

    def test_extract_cv_by_extension(self, tmp_path):
        """Extension-based detection (no content_type)."""
        cv_file = tmp_path / "cv.md"
        cv_file.write_text(SAMPLE_CV_MARKDOWN)
        text = extract_file_text(cv_file, None, max_chars=50000)
        assert "John Johnson" in text

    def test_truncation_works(self, tmp_path):
        cv_file = tmp_path / "cv.md"
        cv_file.write_text(SAMPLE_CV_MARKDOWN)
        text = extract_file_text(cv_file, "text/markdown", max_chars=200)
        assert len(text) <= 200


@requires_weasyprint
class TestRenderStructuredCv:
    """Render structured CV data to PDF via Jinja2 template."""

    SAMPLE_CV = {
        "name": "John Johnson",
        "contact": {
            "location": "Springfield, USA",
            "phone": "+1-555-0100",
            "email": "john@snakeoil.example.com",
            "linkedin": "linkedin.com/in/johnjohnson",
        },
        "headline": "Senior Product Manager & Cloud Architect",
        "summary": (
            "Results-driven product leader with 15+ years of experience in "
            "cloud platforms, developer tools, and enterprise SaaS."
        ),
        "skills": [
            "Cloud Architecture",
            "Product Strategy",
            "Developer Experience",
            "Cross-functional Leadership",
            "Agile & Scrum",
        ],
        "experience": [
            {
                "company": "Snake Oil Inc.",
                "title": "Head of Product",
                "period": "2022 – Present",
                "location": "Remote",
                "summary": "Leading product strategy for developer platform.",
                "bullets": [
                    "Launched 3 new API products generating $4M ARR",
                    "Established product-led growth motion",
                    "Led cross-functional team of 12",
                ],
            },
            {
                "company": "Acme Corp",
                "title": "Senior Product Manager",
                "period": "2017 – 2022",
                "location": "New York, NY",
                "bullets": [
                    "Drove cloud migration reducing costs by 40%",
                    "Spearheaded developer portal with 50k MAU",
                    "Increased uptime from 99.9% to 99.99%",
                ],
            },
            {
                "company": "Widgets Ltd.",
                "title": "Product Manager",
                "period": "2012 – 2017",
                "location": "Chicago, IL",
                "bullets": [
                    "Managed 5 B2B SaaS products",
                    "Grew ARR from $2M to $8M",
                ],
            },
        ],
        "education": [
            {
                "institution": "Springfield University",
                "degree": "BSc Computer Science",
            },
            {
                "institution": "State Business School",
                "degree": "MBA",
            },
        ],
        "certifications": [
            "AWS Solutions Architect Professional",
            "Certified Scrum Product Owner (CSPO)",
        ],
    }

    SAMPLE_CSS = """
    body {
        font-family: 'Inter', sans-serif;
        color: #1a1a1a;
        line-height: 1.5;
    }
    h1 { font-size: 22pt; font-weight: 700; color: #0f172a; }
    h2 {
        font-size: 12pt; font-weight: 700;
        border-bottom: 1.5pt solid #c2815b;
        padding-bottom: 3pt;
    }
    .headline { font-size: 11pt; color: #475569; }
    .contact { font-size: 9pt; color: #64748b; }
    .job-title { font-size: 10.5pt; }
    .job-company { font-size: 10pt; color: #475569; }
    """

    def test_renders_structured_cv_to_pdf(self):
        """Full structured CV data produces valid PDF."""
        result = render_cv_to_pdf(self.SAMPLE_CV, self.SAMPLE_CSS)
        assert result[:5] == b"%PDF-"
        assert len(result) > 5000, f"PDF too small: {len(result)} bytes"

    def test_pdf_contains_text(self):
        """Verify PDF contains extractable text from the CV."""
        import io

        from pypdf import PdfReader

        result = render_cv_to_pdf(self.SAMPLE_CV, self.SAMPLE_CSS)
        reader = PdfReader(io.BytesIO(result))
        full_text = " ".join(page.extract_text() or "" for page in reader.pages)
        assert "John" in full_text
        assert "Johnson" in full_text
        assert "Acme Corp" in full_text
        assert "Snake Oil" in full_text


