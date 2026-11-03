from urllib.parse import urlparse

import structlog
from fastapi import Request

logger = structlog.get_logger(__name__)


def get_origin(
    request: Request | None = None, default_origin: str | None = None
) -> str | None:

    if not request:
        return default_origin

    from_header_origin = request.headers.get("ba-origin", None) if request else None
    from_header_host = request.headers.get("host", None) if request else None
    from_forward_origin = (
        request.headers.get("forward-origin", None) if request else None
    )
    if from_forward_origin:
        # format https://somedomain.tld/some/url
        # extract https://somedomain.tld
        origin = "/".join(from_forward_origin.split("/")[:3])
        logger.debug("origin_resolved", source="forward-origin", origin=origin)
        return origin

    if from_header_origin:
        logger.debug("origin_resolved", source="ba-origin", origin=from_header_origin)
        return from_header_origin

    if from_header_host:
        # Host header has no scheme. request.url.scheme is unreliable behind a
        # TLS-terminating proxy (Fly, nginx, ...) that forwards to the app over
        # plain HTTP internally — it reports "http" even though the actual
        # public request was "https", which produced mixed-content upload URLs
        # that browsers silently block. Prefer the standard X-Forwarded-Proto
        # header the proxy sets, falling back to request.url.scheme locally
        # where there's no proxy in front of the app at all.
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        origin = f"{scheme}://{from_header_host}"
        logger.debug("origin_resolved", source="host", origin=origin)
        return origin

    return default_origin


def get_preferred_origin(
    request: Request,
    configured_origin: str | None,
) -> str | None:
    """Prefer a request origin when it belongs to the configured site."""
    configured_origin = (configured_origin or "").rstrip("/")
    request_origin = get_origin(request, None)

    if not configured_origin:
        return request_origin
    if not request_origin:
        return configured_origin

    configured_host = urlparse(configured_origin).hostname
    request_host = urlparse(request_origin).hostname
    if configured_host and request_host and (
        request_host == configured_host
        or request_host.endswith(f".{configured_host}")
    ):
        return request_origin.rstrip("/")

    return configured_origin
