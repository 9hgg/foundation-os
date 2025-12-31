from fastapi import Request


def get_origin(
    request: Request | None = None, default_origin: str | None = None
) -> str | None:

    if not request:
        return default_origin

    host = request.client.host
    print("With this host:", host)
    request_origin = request.url.__str__() if request else None
    print("Request origin:", request_origin)
    from_header_origin = request.headers.get("ba-origin", None) if request else None
    print("From header origin:", from_header_origin)
    from_header_host = request.headers.get("host", None) if request else None
    print("From header host:", from_header_host)
    from_forward_origin = (
        request.headers.get("forward-origin", None) if request else None
    )
    print("From header forward-origin:", from_forward_origin)
    if from_forward_origin:
        # format https://somedomain.tld/some/url
        # extract https://somedomain.tld
        origin = "/".join(from_forward_origin.split("/")[:3])
        print("Using forward-origin as origin:", origin)
        return origin

    if from_header_origin:
        print("Using from-header-origin as origin:", from_header_origin)
        return from_header_origin

    if from_header_host:
        print("Using from-header-host as origin:", from_header_host)
        return from_header_host

    return default_origin
