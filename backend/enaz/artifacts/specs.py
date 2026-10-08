"""Typed artifact specifications.

The LLM emits a validated spec (JSON), and deterministic renderers turn the spec
into a clean .pptx/.docx/.xlsx. This keeps generated Office files well-formed and
editable, and makes "edit by instruction" a patch to the spec rather than a full
regeneration.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ---- slides ---------------------------------------------------------------
class Slide(BaseModel):
    layout: Literal["title", "bullets", "two_col", "chart", "table", "quote"] = "bullets"
    title: str = ""
    subtitle: str = ""
    bullets: list[str] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    chart_labels: list[str] = Field(default_factory=list)
    chart_values: list[float] = Field(default_factory=list)
    notes: str = ""


class DeckSpec(BaseModel):
    kind: Literal["slides"] = "slides"
    title: str
    subtitle: str = ""
    slides: list[Slide] = Field(default_factory=list)


# ---- document -------------------------------------------------------------
class DocSection(BaseModel):
    heading: str = ""
    paragraphs: list[str] = Field(default_factory=list)
    bullets: list[str] = Field(default_factory=list)
    columns: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)


class DocSpec(BaseModel):
    kind: Literal["doc"] = "doc"
    title: str
    subtitle: str = ""
    sections: list[DocSection] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)


# ---- spreadsheet ----------------------------------------------------------
class SheetTab(BaseModel):
    name: str = "Sheet1"
    columns: list[str] = Field(default_factory=list)
    rows: list[list[str]] = Field(default_factory=list)
    # Optional derived column: (header, excel_formula_template using row number {r})
    formula_header: str = ""
    formula_template: str = ""


class SheetSpec(BaseModel):
    kind: Literal["sheet"] = "sheet"
    title: str
    tabs: list[SheetTab] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)


SPEC_MODELS = {"slides": DeckSpec, "doc": DocSpec, "sheet": SheetSpec}
FORMATS = {"slides": "pptx", "doc": "docx", "sheet": "xlsx"}


def deck_schema() -> dict:
    return DeckSpec.model_json_schema()


def doc_schema() -> dict:
    return DocSpec.model_json_schema()


def sheet_schema() -> dict:
    return SheetSpec.model_json_schema()
