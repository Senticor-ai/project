"""Document renderer — converts structured CV data to PDF via WeasyPrint.

Pipeline: CV data (dict) + agent CSS → Jinja2 HTML → WeasyPrint → PDF bytes.

WeasyPrint requires system libraries (pango, cairo, gobject). The import is
deferred to ``render_cv_to_pdf()`` so the backend can start even when these
libraries are missing — only the render endpoint will fail.
"""

from __future__ import annotations

import logging
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = Path(__file__).resolve().parent / "templates" / "cv"
_FONTS_DIR = _TEMPLATES_DIR / "fonts"

_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=True,
)


def _load_base_css() -> str:
    """Load the base CSS reset/print foundations."""
    return (_TEMPLATES_DIR / "base.css").read_text(encoding="utf-8")


def _build_font_face_css() -> str:
    """Generate @font-face rules for self-hosted fonts."""
    rules: list[str] = []
    font_map = {
        "Inter-Regular.woff2": ("Inter", "normal", "400"),
        "Inter-Bold.woff2": ("Inter", "normal", "700"),
        "SourceSans3-Regular.woff2": ("Source Sans 3", "normal", "400"),
        "SourceSans3-Bold.woff2": ("Source Sans 3", "normal", "700"),
        # Latin-ext subset covers German umlauts (ä, ö, ü, ß)
        "SourceSans3-LatinExt.woff2": ("Source Sans 3", "normal", "400 700"),
    }
    for filename, (family, style, weight) in font_map.items():
        font_path = _FONTS_DIR / filename
        if font_path.exists():
            # WeasyPrint needs file:// URLs for local fonts
            rules.append(
                f"@font-face {{\n"
                f"  font-family: '{family}';\n"
                f"  font-style: {style};\n"
                f"  font-weight: {weight};\n"
                f"  src: url('file://{font_path}') format('woff2');\n"
                f"}}"
            )
    return "\n\n".join(rules)


def render_cv_to_pdf(cv: dict, custom_css: str) -> bytes:
    """Render structured CV data to a PDF.

    Args:
        cv: Structured CV data (name, headline, experience, etc.).
        custom_css: Agent-generated CSS for visual styling.

    Returns:
        PDF file contents as bytes.
    """
    base_css = _load_base_css()
    font_css = _build_font_face_css()

    # Combine: font declarations + base reset + agent styling
    combined_css = f"{font_css}\n\n{base_css}"

    template = _jinja_env.get_template("base.html.j2")
    html_content = template.render(cv=cv, base_css=combined_css, custom_css=custom_css)

    from weasyprint import CSS, HTML
    from weasyprint.text.fonts import FontConfiguration

    font_config = FontConfiguration()
    html = HTML(string=html_content)
    css = CSS(string=combined_css + "\n" + custom_css, font_config=font_config)

    pdf_bytes = html.write_pdf(stylesheets=[css], font_config=font_config)
    logger.info("Rendered CV PDF (%d bytes) for %s", len(pdf_bytes), cv.get("name", "unknown"))
    return pdf_bytes
