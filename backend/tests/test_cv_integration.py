"""Integration test — real CV + job description through the pipeline.

Uses Wolfgang's actual CV markdown and an Anthropic job description HTML
to verify text extraction and PDF rendering work end-to-end.
"""

from __future__ import annotations

from pathlib import Path

from app.document_renderer import render_cv_to_pdf
from app.text_extractor import extract_file_text

_TMP_DIR = Path(__file__).resolve().parents[2] / "tmp"

CV_MD = _TMP_DIR / "Freelance Wolfgang Ihloff CV.md"
JOB_HTML = _TMP_DIR / "Job Application for Product Manager, Safeguards (Beneficial Deployments) at Anthropic.html"


class TestTextExtraction:
    """Verify text extraction works on real files."""

    def test_extract_cv_markdown(self):
        assert CV_MD.exists(), f"CV file not found: {CV_MD}"
        text = extract_file_text(CV_MD, "text/markdown", max_chars=50000)
        assert len(text) > 500
        assert "Wolfgang Ihloff" in text
        assert "Aleph Alpha" in text
        assert "Adobe" in text
        assert "Product Leader" in text

    def test_extract_job_description_html(self):
        assert JOB_HTML.exists(), f"Job description not found: {JOB_HTML}"
        # HTML is a text type — extractor reads it as text
        text = extract_file_text(JOB_HTML, "text/html", max_chars=50000)
        assert len(text) > 500
        assert "Anthropic" in text

    def test_extract_cv_by_extension(self):
        """Extension-based detection (no content_type)."""
        text = extract_file_text(CV_MD, None, max_chars=50000)
        assert "Wolfgang Ihloff" in text

    def test_truncation_works(self):
        text = extract_file_text(CV_MD, "text/markdown", max_chars=200)
        assert len(text) <= 200


class TestRenderRealCv:
    """Render Wolfgang's actual CV data to PDF."""

    REAL_CV = {
        "name": "Wolfgang Ihloff",
        "contact": {
            "location": "Las Palmas de Gran Canaria, Spain",
            "phone": "+34672274837",
            "email": "wolfgang@ihloff.de",
            "linkedin": "linkedin.com/in/wolfgangilhoff",
        },
        "headline": "Product Leader, Technologist, Visionary and Executor",
        "summary": (
            '"Can do" leader with 20+ years\u2019 customer engagement, product management '
            "and engineering experience, specializing in multi-cloud and sovereign platforms. "
            "Track record of leading platform strategy from ideation to delivery in a fast-paced "
            "environment."
        ),
        "skills": [
            "Artificial Intelligence Adoption",
            "AI Process Improvement",
            "Cloud Service Expert",
            "Cross-team Collaboration",
            "Talent Acquisition & Retention",
            "Developer Platform Visionary",
            "Cloud Cost Reduction",
            "Cloud Vendor Management",
            "Global Team Management",
        ],
        "experience": [
            {
                "company": "Senticor",
                "title": "Fractional CTO & CPO",
                "period": "September 2025",
                "summary": (
                    "Consulting services for Enterprise and Public Sector "
                    "Companies in AI topics for sovereign use cases."
                ),
                "bullets": [
                    "Consulting public sector specialized near shore engineering companies",
                    "Technical Guidance on open source product deployment LibreChat",
                    "Legal AI proof of concept using RAGGraph approach",
                ],
            },
            {
                "company": "Aleph Alpha",
                "title": "Team Lead Product (Vertical)",
                "period": "Feb. 2024 - August 2025",
                "location": "51% onsite",
                "summary": (
                    "Build out product teams as first product hire for lighthouse "
                    "German LLM company."
                ),
                "bullets": [
                    "Established product metrics and northstar with personas across org",
                    "Established strategy and roadmap for the German market",
                    "Acted as Product Owner for 3 Scrum teams",
                    "Established UX process as holistic product focus",
                ],
            },
            {
                "company": "Build.One",
                "title": "Head of Product",
                "period": "2022-2023",
                "location": "Remote",
                "bullets": [
                    "Transitioned 3 clients from project based to 1M EUR ARR",
                    "Established Customer Problem Centric Design process",
                ],
            },
            {
                "company": "Adobe",
                "title": "Group Product Manager",
                "period": "2013-2022",
                "location": "Remote - USA",
                "summary": (
                    "Promoted to unify fragmented developer ecosystems across "
                    "hundreds of Adobe product teams."
                ),
                "bullets": [
                    "Spearheaded company-wide developer experience strategy",
                    "Drove $5M in YoY development cost savings",
                    "Increased cloud availability from 99.9% to 99.99%",
                    "Took Azure adoption from 0% to 100% for Creative Cloud",
                    "Effected $10M annual shift in cloud expenditures to Azure",
                ],
            },
            {
                "company": "Sycle",
                "title": "Technical Product Manager",
                "period": "2010-2013",
                "location": "Remote",
                "bullets": [
                    "Launched 4 new products generating $2M increase in ARR",
                    "Migrated 200 Costco hearing aid practices to new platform",
                ],
            },
        ],
        "education": [
            {
                "institution": "Fernuniversitaet Hagen",
                "degree": "Computer Science (not completed)",
                "description": (
                    "Scholarship for semester abroad at San Diego State University"
                ),
            },
            {
                "institution": "Universitaet Karlsruhe",
                "degree": "Economics (not completed)",
            },
        ],
        "certifications": [
            "Pragmatic Marketing Foundations",
            "Certified Scrum Product Owner (CSPO)",
        ],
    }

    ANTHROPIC_TAILORED_CSS = """
    body {
        font-family: 'Inter', sans-serif;
        color: #1a1a1a;
        line-height: 1.5;
    }
    h1 {
        font-size: 22pt;
        font-weight: 700;
        margin-bottom: 2pt;
        color: #0f172a;
    }
    .headline {
        font-size: 11pt;
        color: #475569;
        margin-bottom: 6pt;
    }
    .contact {
        font-size: 9pt;
        color: #64748b;
        margin-bottom: 12pt;
    }
    .sep {
        color: #cbd5e1;
    }
    h2 {
        font-size: 12pt;
        font-weight: 700;
        color: #0f172a;
        border-bottom: 1.5pt solid #c2815b;
        padding-bottom: 3pt;
        margin-top: 14pt;
        margin-bottom: 6pt;
    }
    .summary { font-size: 10pt; margin-bottom: 8pt; }
    .skills-list {
        list-style: none;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: 4pt 12pt;
    }
    .skills-list li {
        font-size: 9pt;
        background: #f1f5f9;
        padding: 2pt 6pt;
        border-radius: 3pt;
    }
    .job { margin-bottom: 10pt; }
    .job-header { margin-bottom: 3pt; }
    .job-title { font-size: 10.5pt; }
    .job-company { font-size: 10pt; color: #475569; }
    .job-period, .job-location {
        font-size: 9pt;
        color: #64748b;
    }
    .job-summary { font-size: 9.5pt; font-style: italic; margin: 2pt 0; }
    .job-bullets { font-size: 9.5pt; }
    .job-bullets li { margin-bottom: 1pt; }
    .edu-entry { margin-bottom: 6pt; }
    .edu-period { font-size: 9pt; color: #64748b; display: block; }
    """

    def test_renders_real_cv_to_pdf(self):
        """Full CV with real data produces valid PDF."""
        result = render_cv_to_pdf(self.REAL_CV, self.ANTHROPIC_TAILORED_CSS)
        assert result[:5] == b"%PDF-"
        # A real multi-page CV should be substantial
        assert len(result) > 5000, f"PDF too small: {len(result)} bytes"

    def test_pdf_contains_text(self):
        """Verify PDF contains extractable text from the CV."""
        import io

        from pypdf import PdfReader

        result = render_cv_to_pdf(self.REAL_CV, self.ANTHROPIC_TAILORED_CSS)
        reader = PdfReader(io.BytesIO(result))
        full_text = " ".join(page.extract_text() or "" for page in reader.pages)
        assert "Wolfgang" in full_text
        assert "Ihloff" in full_text
        assert "Adobe" in full_text
        assert "Aleph Alpha" in full_text
