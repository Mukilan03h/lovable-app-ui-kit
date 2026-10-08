"""Markitdown-based extraction.

Microsoft's markitdown converts a wide range of formats — PDF, DOCX, PPTX, XLSX,
HTML, CSV, JSON, images (with OCR), audio (with transcription), ZIP, EPUB — to
clean Markdown. We use it as the primary extractor and fall back to the built-in
parsers when it is unavailable or errors.
"""

from __future__ import annotations

import io
from functools import lru_cache
from pathlib import PurePath

from .parsers import EXTENSION_TYPES, ParsedDocument, parse_bytes, parse_markdown


@lru_cache
def _converter():
    from markitdown import MarkItDown

    return MarkItDown(enable_plugins=False)


def available() -> bool:
    try:
        _converter()
        return True
    except Exception:
        return False


def extract_markdown(filename: str, data: bytes) -> str | None:
    """Return Markdown for the file, or None if markitdown can't handle it."""
    try:
        result = _converter().convert_stream(io.BytesIO(data), file_extension=PurePath(filename).suffix)
        text = (result.text_content or "").strip()
        return text or None
    except Exception:
        return None


def parse_with_markitdown(filename: str, data: bytes) -> ParsedDocument:
    """Preferred parser: markitdown → structured ParsedDocument, else built-in."""
    markdown = extract_markdown(filename, data)
    if markdown:
        title = PurePath(filename).stem.replace("_", " ").replace("-", " ").strip() or filename
        doc = parse_markdown(title, markdown)
        doc.doc_type = EXTENSION_TYPES.get(PurePath(filename).suffix.lower(), "doc")
        if not doc.title or doc.title == title:
            doc.title = title
        return doc
    return parse_bytes(filename, data)
