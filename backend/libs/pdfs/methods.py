import asyncio
import datetime
import hashlib
import json
from typing import Any, Protocol

from jinja2 import Environment, select_autoescape

from libs.logger.customLogger import print_warning

from .config import PDFS_SETTINGS
from .models import PdfRenderOptions, PdfRenderRequest

try:  # Optional dependency
    from playwright.async_api import async_playwright

    PLAYWRIGHT_AVAILABLE = True
except Exception:  # pragma: no cover - optional
    PLAYWRIGHT_AVAILABLE = False
    async_playwright = None


class PdfCache(Protocol):
    """Protocol for pluggable PDF cache implementations."""

    async def get(self, key: str) -> bytes | None:  # pragma: no cover - interface
        ...

    async def set(self, key: str, value: bytes, ttl_seconds: int | None = None) -> None:  # pragma: no cover - interface
        ...


class PdfRenderError(Exception):
    """Raised when PDF rendering or validation fails."""

    def __init__(
        self,
        title: str,
        description: str,
        code: str,
        status_code: int,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(description)
        self.title = title
        self.description = description
        self.code = code
        self.status_code = status_code
        self.details = details


_TEMPLATE_ENV: Environment | None = None
_CACHE: PdfCache | None = None
_PLAYWRIGHT_BROWSER: Any | None = None
_PLAYWRIGHT_LOCK = asyncio.Lock()


class _TemplateNow:
    """Expose a fixed datetime that works as `now` and `now()` in Jinja."""

    def __init__(self, value: datetime.datetime) -> None:
        self._value = value

    def __call__(self) -> datetime.datetime:
        return self._value

    def __getattr__(self, name: str) -> Any:
        return getattr(self._value, name)

    def __str__(self) -> str:
        return str(self._value)

    def __format__(self, format_spec: str) -> str:
        return format(self._value, format_spec)


def register_pdf_cache(cache: PdfCache | None) -> None:
    """Register a cache implementation (optional)."""

    global _CACHE
    _CACHE = cache


def _get_template_environment() -> Environment:
    """Return a cached Jinja2 environment for HTML templates."""

    global _TEMPLATE_ENV
    if _TEMPLATE_ENV is None:
        _TEMPLATE_ENV = Environment(autoescape=select_autoescape(["html", "xml"]))
    return _TEMPLATE_ENV


def _json_size_kb(payload: dict[str, Any]) -> float:
    """Return the payload size in kilobytes as JSON."""
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return len(serialized.encode("utf-8")) / 1024


def _ensure_engine_available(engine: str) -> None:
    """Ensure the requested engine is available and enabled."""
    if engine == "playwright" and not PLAYWRIGHT_AVAILABLE:
        raise PdfRenderError(
            title="Playwright not available",
            description="Playwright is not installed or failed to import.",
            code="playwright_unavailable",
            status_code=503,
        )
    if engine == "playwright" and not PDFS_SETTINGS.PLAYWRIGHT_ENABLED:
        raise PdfRenderError(
            title="Playwright disabled",
            description="Playwright rendering is disabled by configuration.",
            code="playwright_disabled",
            status_code=503,
        )


def _hash_request(request: PdfRenderRequest, options: PdfRenderOptions, engine: str) -> str:
    """Return a stable hash for caching rendered PDFs."""
    data = {
        "document_type": request.document_type,
        "payload": request.payload,
        "options": options.model_dump(),
        "engine": engine,
        "template": request.template,
        "header_template": options.header_template,
        "footer_template": options.footer_template,
    }
    raw = json.dumps(data, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def _get_cached_pdf(cache_key: str) -> bytes | None:
    """Retrieve cached PDF bytes, if available."""
    if _CACHE is None:
        return None
    try:
        return await _CACHE.get(cache_key)
    except Exception as exc:  # pragma: no cover - cache errors should not break rendering
        print_warning(f"PDF cache read failed: {exc}")
        return None


async def _set_cached_pdf(cache_key: str, pdf_bytes: bytes) -> None:
    """Store PDF bytes in the cache, if configured."""
    if _CACHE is None:
        return None
    try:
        await _CACHE.set(cache_key, pdf_bytes)
    except Exception as exc:  # pragma: no cover - cache errors should not break rendering
        print_warning(f"PDF cache write failed: {exc}")


async def _get_playwright_browser() -> Any:
    """Get or initialize a shared Playwright browser instance."""
    if not PLAYWRIGHT_AVAILABLE or async_playwright is None:
        raise PdfRenderError(
            title="Playwright not available",
            description="Playwright is not installed or failed to import.",
            code="playwright_unavailable",
            status_code=503,
        )

    global _PLAYWRIGHT_BROWSER
    if _PLAYWRIGHT_BROWSER:
        return _PLAYWRIGHT_BROWSER

    async with _PLAYWRIGHT_LOCK:
        if _PLAYWRIGHT_BROWSER:
            return _PLAYWRIGHT_BROWSER
        playwright = await async_playwright().start()
        _PLAYWRIGHT_BROWSER = await playwright.chromium.launch()
        return _PLAYWRIGHT_BROWSER


def _build_margins(
    options: PdfRenderOptions, has_header_footer: bool
) -> dict[str, str] | None:
    """Build margin settings for Playwright PDF generation."""
    margin: dict[str, str] = {}
    if options.margin_top:
        margin["top"] = options.margin_top
    if options.margin_bottom:
        margin["bottom"] = options.margin_bottom
    if options.margin_left:
        margin["left"] = options.margin_left
    if options.margin_right:
        margin["right"] = options.margin_right

    if margin:
        return margin

    if has_header_footer:
        return {"top": "20mm", "bottom": "20mm"}

    return None


async def _render_html_to_pdf(
    html: str,
    page_size: str,
    landscape: bool,
    header_template: str | None,
    footer_template: str | None,
    margins: dict[str, str] | None,
) -> bytes:
    """Render HTML to PDF bytes using Playwright."""
    browser = await _get_playwright_browser()
    page = await browser.new_page()
    try:
        await page.set_content(html, wait_until="networkidle")
        has_header_footer = bool(header_template or footer_template)
        pdf_options: dict[str, Any] = {
            "format": "Letter" if page_size == "LETTER" else "A4",
            "landscape": landscape,
            "print_background": True,
        }
        if has_header_footer:
            pdf_options["display_header_footer"] = True
            pdf_options["header_template"] = header_template or "<span></span>"
            pdf_options["footer_template"] = footer_template or "<span></span>"
        if margins:
            pdf_options["margin"] = margins
        print_warning(f"Rendering PDF with options: {pdf_options}")
        pdf_bytes = await page.pdf(**pdf_options)
        return pdf_bytes
    finally:
        await page.close()


async def render_pdf(request: PdfRenderRequest) -> bytes:
    """
    Render a PDF using a frontend-provided Jinja template and payload.

    Raises:
        PdfRenderError: When rendering or validation fails.
    """

    payload_size_kb = _json_size_kb(request.payload)
    if payload_size_kb > PDFS_SETTINGS.MAX_PAYLOAD_KB:
        raise PdfRenderError(
            title="Payload too large",
            description="The payload exceeds the maximum allowed size.",
            code="payload_too_large",
            status_code=413,
            details={
                "max_kb": PDFS_SETTINGS.MAX_PAYLOAD_KB,
                "actual_kb": round(payload_size_kb, 2),
            },
        )

    options = request.options or PdfRenderOptions()
    engine = options.engine or PDFS_SETTINGS.DEFAULT_ENGINE
    if engine not in {"playwright"}:
        raise PdfRenderError(
            title="Invalid engine",
            description="The requested rendering engine is not supported.",
            code="invalid_engine",
            status_code=400,
            details={"engine": engine},
        )

    if not request.template:
        raise PdfRenderError(
            title="Template required",
            description="PDF rendering requires a template provided by the client.",
            code="template_required",
            status_code=400,
        )

    _ensure_engine_available(engine)
    cache_key = _hash_request(request, options, engine)
    cached_pdf = await _get_cached_pdf(cache_key)
    if cached_pdf is not None:
        return cached_pdf

    template_env = _get_template_environment()
    render_now = datetime.datetime.now(datetime.timezone.utc)
    context = dict(request.payload)
    context.update(
        {
            "document_type": request.document_type,
            "page_size": options.page_size,
            "locale": options.locale,
            "debug": options.debug,
            "now": _TemplateNow(render_now),
        }
    )
    html = template_env.from_string(request.template).render(context)

    # Force body margins to 0 so content aligns with Playwright's defined margins
    # We do NOT set @page { margin: 0 } because that can override the Playwright margin options
    css_reset = "<style>body { margin: 0; padding: 0; }</style>"
    html = (
        html.replace("</head>", f"{css_reset}</head>")
        if "</head>" in html
        else css_reset + html
    )

    header_template = None
    footer_template = None
    if options.header_template:
        content = template_env.from_string(options.header_template).render(context)
        # Chromium header templates require explicit font-size to be visible
        header_template = f'<div style="font-size: 10px; width: 100%; text-align: center;">{content}</div>'

    if options.footer_template:
        content = template_env.from_string(options.footer_template).render(context)
        # Chromium footer templates require explicit font-size to be visible
        footer_template = f'<div style="font-size: 10px; width: 100%; text-align: center;">{content}</div>'

    print_warning(f"we have header_template {header_template} and footer_template {footer_template}")
    margins = _build_margins(options, bool(header_template or footer_template))

    pdf_bytes = await _render_html_to_pdf(
        html,
        options.page_size,
        options.landscape,
        header_template,
        footer_template,
        margins,
    )
    await _set_cached_pdf(cache_key, pdf_bytes)
    return pdf_bytes


async def render_html(request: PdfRenderRequest) -> str:
    """
    Render the Jinja template to HTML without converting to PDF.

    Raises:
        PdfRenderError: When rendering or validation fails.
    """

    payload_size_kb = _json_size_kb(request.payload)
    if payload_size_kb > PDFS_SETTINGS.MAX_PAYLOAD_KB:
        raise PdfRenderError(
            title="Payload too large",
            description="The payload exceeds the maximum allowed size.",
            code="payload_too_large",
            status_code=413,
            details={
                "max_kb": PDFS_SETTINGS.MAX_PAYLOAD_KB,
                "actual_kb": round(payload_size_kb, 2),
            },
        )

    if not request.template:
        raise PdfRenderError(
            title="Template required",
            description="HTML rendering requires a template provided by the client.",
            code="template_required",
            status_code=400,
        )

    template_env = _get_template_environment()
    render_now = datetime.datetime.now(datetime.timezone.utc)
    options = request.options or PdfRenderOptions()
    context = dict(request.payload)
    context.update(
        {
            "document_type": request.document_type,
            "page_size": options.page_size,
            "locale": options.locale,
            "debug": options.debug,
            "now": _TemplateNow(render_now),
        }
    )
    html = template_env.from_string(request.template).render(context)

    css_reset = "<style>body { margin: 0; padding: 0; }</style>"
    html = (
        html.replace("</head>", f"{css_reset}</head>")
        if "</head>" in html
        else css_reset + html
    )

    return html


__all__ = ["PdfRenderError", "register_pdf_cache", "render_html", "render_pdf"]
