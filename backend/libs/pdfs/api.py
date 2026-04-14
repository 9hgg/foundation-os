import re
from io import BytesIO

from fastapi import APIRouter, Response, status
from fastapi.responses import JSONResponse, StreamingResponse

from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .methods import PdfRenderError, render_html, render_pdf
from .models import PdfRenderOptions, PdfRenderRequest

FILENAME_SAFE_PATTERN = re.compile(r"[^a-zA-Z0-9_.-]+")


def _sanitize_filename(filename: str, extension: str = ".pdf") -> str:
    """Sanitize a filename for Content-Disposition usage."""
    sanitized = FILENAME_SAFE_PATTERN.sub("_", filename).strip("._")
    if not sanitized:
        sanitized = "document"
    if not sanitized.lower().endswith(extension):
        sanitized = f"{sanitized}{extension}"
    return sanitized


def _build_error_response(error: PdfRenderError) -> JSONResponse:
    """Build a JSON response for known rendering errors."""
    endpoint_error = EndpointError(
        title=error.title,
        description=error.description,
        code=error.code,
        details=error.details,
    )
    content = EndpointOutput(error=endpoint_error).model_dump()
    return JSONResponse(status_code=error.status_code, content=content)


def _build_unexpected_error_response(error: Exception) -> JSONResponse:
    """Build a JSON response for unexpected errors."""
    endpoint_error = EndpointError(
        title="Rendering failed",
        description=str(error),
        code="render_failed",
    )
    content = EndpointOutput(error=endpoint_error).model_dump()
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content=content
    )


async def _render_html_response(request: PdfRenderRequest) -> Response:
    """Render the HTML and return a streaming response or JSON error."""
    html_string = await render_html(request)

    options = request.options or PdfRenderOptions()
    filename = _sanitize_filename(
        options.filename or f"{request.document_type}.html", extension=".html"
    )
    disposition = options.disposition
    headers = {
        "Content-Disposition": f'{disposition}; filename="{filename}"',
        "X-Content-Type-Options": "nosniff",
    }
    return StreamingResponse(
        BytesIO(html_string.encode("utf-8")),
        media_type="text/html",
        headers=headers,
    )


async def _render_response(request: PdfRenderRequest) -> Response:
    """Render the PDF and return a streaming response or JSON error."""
    # try:
    pdf_bytes = await render_pdf(request)
    # except PdfRenderError as exc:
    #     return _build_error_response(exc)
    # except Exception as exc:  # pragma: no cover - fallback
    #     return _build_unexpected_error_response(exc)

    options = request.options or PdfRenderOptions()
    filename = _sanitize_filename(options.filename or f"{request.document_type}.pdf")
    disposition = options.disposition
    headers = {
        "Content-Disposition": f'{disposition}; filename="{filename}"',
        "X-Content-Type-Options": "nosniff",
    }
    return StreamingResponse(
        BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers=headers,
    )


def create_pdfs_router() -> APIRouter:
    """Create a PDF router without authentication requirements."""
    router = APIRouter()

    @router.post("/api/pdfs/render", tags=["pdfs"])
    async def render_endpoint(request: PdfRenderRequest) -> Response:
        """Render a PDF document based on the requested document type."""
        return await _render_response(request)

    @router.post("/api/pdfs/render-html", tags=["pdfs"])
    async def render_html_endpoint(request: PdfRenderRequest) -> Response:
        """Render an HTML document based on the requested document type."""
        return await _render_html_response(request)

    return router


def create_pdfs_router_with_auth() -> APIRouter:
    """Create a PDF router that requires an authenticated user."""
    router = APIRouter()

    @router.post("/api/pdfs/render", tags=["pdfs"])
    async def render_endpoint(
        request: PdfRenderRequest, classic_deps: ClassicDeps__dep
    ) -> Response:
        """Render a PDF document after basic auth checks."""
        current_user_db, _, _ = classic_deps
        if not current_user_db or not current_user_db.email_verified:
            endpoint_error = EndpointError(
                title="Not authorized",
                description="You are not authorized (email not verified)",
                code="unauthorized",
            )
            content = EndpointOutput(error=endpoint_error).model_dump()
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED, content=content
            )

        return await _render_response(request)

    @router.post("/api/pdfs/render-html", tags=["pdfs"])
    async def render_html_endpoint(
        request: PdfRenderRequest, classic_deps: ClassicDeps__dep
    ) -> Response:
        """Render an HTML document after basic auth checks."""
        current_user_db, _, _ = classic_deps
        if not current_user_db or not current_user_db.email_verified:
            endpoint_error = EndpointError(
                title="Not authorized",
                description="You are not authorized (email not verified)",
                code="unauthorized",
            )
            content = EndpointOutput(error=endpoint_error).model_dump()
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED, content=content
            )

        return await _render_html_response(request)

    return router


__all__ = ["create_pdfs_router", "create_pdfs_router_with_auth"]
