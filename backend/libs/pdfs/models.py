from typing import Any, Literal

from libs.utils.types import BaseModelWithConfig


class PdfRenderOptions(BaseModelWithConfig):
    """Options controlling PDF rendering."""

    page_size: Literal["A4", "LETTER"] = "A4"
    landscape: bool = False
    disposition: Literal["inline", "attachment"] = "inline"
    filename: str | None = None
    engine: Literal["playwright"] | None = None
    locale: str | None = None
    debug: bool = False
    header_template: str | None = None
    footer_template: str | None = None
    margin_top: str | None = None
    margin_bottom: str | None = None
    margin_left: str | None = None
    margin_right: str | None = None


class PdfRenderRequest(BaseModelWithConfig):
    """Request payload for PDF rendering."""

    document_type: str
    payload: dict[str, Any]
    options: PdfRenderOptions | None = None
    template: str | None = None
