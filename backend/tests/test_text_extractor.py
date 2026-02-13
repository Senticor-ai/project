"""Tests for the shared text extraction utility."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from app.text_extractor import (
    extract_file_text,
    extract_pdf_text,
    extract_text_file,
)

pytestmark = pytest.mark.unit


class TestExtractPdfText:
    def test_returns_empty_for_zero_max_chars(self, tmp_path: Path):
        pdf_path = tmp_path / "test.pdf"
        pdf_path.touch()
        assert extract_pdf_text(pdf_path, max_chars=0) == ""

    def test_returns_empty_for_missing_file(self, tmp_path: Path):
        pdf_path = tmp_path / "nonexistent.pdf"
        assert extract_pdf_text(pdf_path, max_chars=1000) == ""

    def test_truncates_output(self, tmp_path: Path):
        # Create a mock PdfReader that returns long text
        pdf_path = tmp_path / "test.pdf"
        pdf_path.touch()

        mock_page = MagicMock()
        mock_page.extract_text.return_value = "A" * 100

        with patch("app.text_extractor.PdfReader") as mock_reader_cls:
            mock_reader = MagicMock()
            mock_reader.is_encrypted = False
            mock_reader.pages = [mock_page]
            mock_reader_cls.return_value = mock_reader

            result = extract_pdf_text(pdf_path, max_chars=50)
            assert len(result) == 50

    def test_extracts_text_from_pages(self, tmp_path: Path):
        pdf_path = tmp_path / "test.pdf"
        pdf_path.touch()

        page1 = MagicMock()
        page1.extract_text.return_value = "Hello "
        page2 = MagicMock()
        page2.extract_text.return_value = "World"

        with patch("app.text_extractor.PdfReader") as mock_reader_cls:
            mock_reader = MagicMock()
            mock_reader.is_encrypted = False
            mock_reader.pages = [page1, page2]
            mock_reader_cls.return_value = mock_reader

            result = extract_pdf_text(pdf_path, max_chars=1000)
            assert result == "Hello \nWorld"


class TestExtractTextFile:
    def test_reads_text_file(self, tmp_path: Path):
        txt_path = tmp_path / "test.txt"
        txt_path.write_text("Hello World", encoding="utf-8")
        assert extract_text_file(txt_path, max_chars=1000) == "Hello World"

    def test_truncates_text(self, tmp_path: Path):
        txt_path = tmp_path / "test.md"
        txt_path.write_text("A" * 200, encoding="utf-8")
        result = extract_text_file(txt_path, max_chars=50)
        assert len(result) == 50

    def test_returns_empty_for_zero_max_chars(self, tmp_path: Path):
        txt_path = tmp_path / "test.txt"
        txt_path.write_text("Hello", encoding="utf-8")
        assert extract_text_file(txt_path, max_chars=0) == ""

    def test_returns_empty_for_missing_file(self, tmp_path: Path):
        txt_path = tmp_path / "nonexistent.txt"
        assert extract_text_file(txt_path, max_chars=1000) == ""


class TestExtractFileText:
    def test_pdf_by_content_type(self, tmp_path: Path):
        pdf_path = tmp_path / "doc.bin"
        pdf_path.touch()

        with patch("app.text_extractor.extract_pdf_text", return_value="pdf content") as mock:
            result = extract_file_text(pdf_path, "application/pdf", max_chars=1000)
            assert result == "pdf content"
            mock.assert_called_once_with(pdf_path, 1000)

    def test_pdf_by_extension(self, tmp_path: Path):
        pdf_path = tmp_path / "doc.pdf"
        pdf_path.touch()

        with patch("app.text_extractor.extract_pdf_text", return_value="pdf content") as mock:
            result = extract_file_text(pdf_path, None, max_chars=1000)
            assert result == "pdf content"
            mock.assert_called_once_with(pdf_path, 1000)

    def test_text_by_content_type(self, tmp_path: Path):
        txt_path = tmp_path / "doc.bin"
        txt_path.write_text("hello", encoding="utf-8")

        result = extract_file_text(txt_path, "text/plain", max_chars=1000)
        assert result == "hello"

    def test_markdown_by_content_type(self, tmp_path: Path):
        md_path = tmp_path / "doc.bin"
        md_path.write_text("# Heading", encoding="utf-8")

        result = extract_file_text(md_path, "text/markdown", max_chars=1000)
        assert result == "# Heading"

    def test_markdown_by_extension(self, tmp_path: Path):
        md_path = tmp_path / "doc.md"
        md_path.write_text("# Heading", encoding="utf-8")

        result = extract_file_text(md_path, None, max_chars=1000)
        assert result == "# Heading"

    def test_unknown_type_returns_empty(self, tmp_path: Path):
        bin_path = tmp_path / "doc.bin"
        bin_path.write_bytes(b"\x00\x01\x02")

        result = extract_file_text(bin_path, "application/octet-stream", max_chars=1000)
        assert result == ""
