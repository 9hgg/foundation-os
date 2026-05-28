import random
import re
import time
import typing
import uuid

from fastapi import Request
from starlette import status
from starlette.datastructures import Headers
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from libs.logger import print, print_error


class ProcessTimeHeader(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        start_time: float = time.time()
        response = await call_next(request)
        process_time: float = round(time.time() - start_time, 2)
        response.headers["X-Process-Time"] = str(process_time)
        # print("base_url", request.url, process_time)
        return response


class LogDeviceIdMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        session = request.session
        appSessionId = session.get("appSessionId", None)

        # if appSessionId:
        #     print_color("green", "Middleware: appSessionId IN SESSION", appSessionId)
        # else:
        #     print_color(
        #         "yellow",
        #         "Middleware: appSessionId NOT IN SESSION",
        #     )
        await self.app(scope, receive, send)


class LoggerMiddleware:
    # matching rules should be a list of dicts with keys: matchingFunction, pathModifierFunction
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        scope["request_log_uuid"] = uuid.uuid4().hex
        # value accessible in fastapi.Request scope: request.scope["request_log_uuid"]

        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        # headers = Headers(scope=scope)
        # path = request.url.path
        # base_url = str(request.base_url)
        # method = request.method

        # host = headers.get("host", "").split(":")[0]
        # origin = headers.get("origin", "")
        # referer = headers.get("referer", "")

        # accept_language_header = headers.get("accept-language", "")
        # accepted_languages = parse_accept_language_header(accept_language_header)
        # lang_in_query_params = request.query_params.get(HTTP_KEY_LANG, None)
        # lang_in_post_params = request.query_params.get(HTTP_KEY_LANG, None)

        # lang_to_use = lang_in_query_params if lang_in_query_params is not None else accepted_languages[0][0]

        # if True:
        #     print(
        #         "\t(LoggerMiddleware)",
        #         payload={
        #             "method": method,
        #             "path": path,
        #             "base_url": base_url,
        #             #             payload={
        #             "query_params": request.query_params,
        #             "path_params": request.path_params,
        #             "request.method": request.method,
        #             "ip": request.client.host,
        #             "port": request.client.port,
        #             "cookies": request.cookies,
        #             "request.base_url": request.base_url,
        #             "url": request.url,
        #             # host (The Host is the domain the request is being sent to.)
        #             "host": host,
        #             # origin (The Origin is the domain the request is coming from.)
        #             "origin": origin,
        #             # referer
        #             "referer": referer,
        #             "request_log_uuid": scope["request_log_uuid"],
        #             "lang": {
        #                 "accept_language_header": accept_language_header,
        #                 "accepted_languages": accepted_languages,
        #                 "lang_in_query_params": lang_in_query_params,
        #                 "lang_in_post_params": lang_in_post_params,
        #                 "lang_to_use": lang_to_use,
        #             },
        #             #             },
        #             # "headers": headers
        #         },
        #         request_log_uuid=scope["request_log_uuid"],
        #     )

        session = request.session
        session["count"] = session.get("count", 0) + 1

        await self.app(scope, receive, send)


class CacheControlMiddleware:
    def __init__(self, app, cache_duration: str, exclude_patterns: list[str]):
        self.app = app
        self.cache_duration = cache_duration
        self.exclude_patterns = [re.compile(exclude_pattern) for exclude_pattern in exclude_patterns]

    async def __call__(self, scope, receive, send):
        async def custom_send(message):
            if message.get("type") == "http.response.start":
                headers = message.setdefault("headers", [])

                # if already a cache control header is present, we don't override it
                already_has_cache_control = False
                for header in headers:
                    if header[0].lower() == b"cache-control":
                        already_has_cache_control = True
                        break

                if not already_has_cache_control:
                    request_headers = Headers(scope=scope)

                    exclude_from_cache = False

                    # check if the request header contains a cache-control: no-cache
                    for header in request_headers:
                        if header.lower() == "cache-control" and request_headers[header].lower() == "no-cache":
                            exclude_from_cache = True

                            break

                    if not exclude_from_cache:
                        # avoid caching if the path matches one of the exclude patterns too
                        for exclude_pattern in self.exclude_patterns:
                            if exclude_pattern.search(scope["path"]):
                                exclude_from_cache = True

                                break

                    if not exclude_from_cache:
                        headers.append((b"Cache-Control", self.cache_duration.encode("utf-8")))
                    else:
                        headers.append((b"Cache-Control", b"no-cache"))

            await send(message)

        if scope["type"] == "http":
            return await self.app(scope, receive, custom_send)
        return await self.app(scope, receive, send)


class RandomErrors(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # randomly return the reponse or a gateway timeout to test frontend error handling
        random_number = random.randint(0, 100)  # noqa: S311
        if random_number > 66:
            return JSONResponse(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                content={"reason": "Fake gateway timeout"},
            )
        if random_number > 33:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"reason": "Fake service unavailable"},
            )
        # Fake 401 error to log out
        return JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={"reason": "Fake unauthorized"},
        )


class CustomCSPMiddleware:
    def __init__(self, app, allowed_hosts: str = ""):
        self.app = app
        self.allowed_hosts = allowed_hosts

    async def __call__(self, scope, receive, send):
        # this is CSP middleware, we need to add CSP header to the response
        async def custom_send(message):
            if message.get("type") == "http.response.start":
                headers = message.setdefault("headers", [])

                # TODO: handle Google auth: https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid?hl=fr#content_security_policy

                # if len(self.allowed_hosts) == 0:
                headers.append([
                    b"content-security-policy",
                    b"default-src 'self'; script-src 'self' ; style-src 'self' 'unsafe-inline'; img-src 'self' https://* data:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; frame-src 'none';",
                ])
                # else:
                #     headers.append(
                #         [
                #             b"content-security-policy",
                #             b"default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; frame-src 'none';",
                #         ]
                #     )
                #     headers.append(
                #         [
                #             b"content-security-policy",
                #             b"connect-src 'self' " + self.allowed_hosts.encode("utf-8"),
                #         ]
                #     )

            await send(message)

        if scope["type"] == "http":
            return await self.app(scope, receive, custom_send)
        return await self.app(scope, receive, send)


# custom CSP middleware
class CustomCSPMiddlewareOriginal:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            scope["headers"].append([
                b"content-security-policy",
                b"default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; object-src 'none'; frame-src 'none';",
            ])
        return await self.app(scope, receive, send)


class ReorientsMiddleware:
    # matching rules should be a list of dicts with keys: matchingFunction, pathModifierFunction
    def __init__(self, app, matching_rules: list[dict[str, typing.Callable]]):
        self.app = app
        self.path_mapping = matching_rules

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        # headers = Headers(scope=scope)
        path = request.url.path
        base_url = str(request.base_url)
        method = request.method
        # if False:
        #     print(
        #         "\t(ReorientsMiddleware)",
        #         payload={
        #             "method": method,
        #             "path": path,
        #             "base_url": base_url,
        #             # "headers": headers
        #         },
        #         request_log_uuid=scope.get("request_log_uuid", "no session"),
        #     )

        for rule in self.path_mapping:
            if rule["matchingFunction"](path, base_url, method):
                new_path = rule["pathModifierFunction"](path, base_url, method)
                print(
                    "\t redefined path: " + path,
                    request_log_uuid=scope.get("request_log_uuid", "no session"),
                )
                scope["path"] = new_path
                break

        # url = URL(scope=scope)

        # if url.path in self.path_mapping:
        #     url = url.replace(path=self.path_mapping[url.path])
        #     response = RedirectResponse(url, status_code=301)
        #     await response(scope, receive, send)
        #     return

        await self.app(scope, receive, send)


class PrintHeader(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        headers = Headers(scope=request.scope)
        for header in headers:
            # if header.startswith("ba"):
            print(
                header,
                headers[header],
            )
        # host = headers.get("host", "").split(":")[0]
        # origin = headers.get("origin", "")
        # referer = headers.get("referer", "")
        # print("request", request)
        # print(
        #     payload={
        #         "query_params": request.query_params,
        #         "path_params": request.path_params,
        #         "method": request.method,
        #         "ip": request.client.host,
        #         "port": request.client.port,
        #         "cookies": request.cookies,
        #         "base_url": request.base_url,
        #         "url": request.url,
        #         # host (The Host is the domain the request is being sent to.)
        #         "host": host,
        #         # origin (The Origin is the domain the request is coming from.)
        #         "origin": origin,
        #         # referer
        #         "referer": referer,
        #         "headers": headers
        #     },

        # )

        return await call_next(request)


# Custom middleware to catch 405 errors
class Catch405Middleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        if response.status_code == 405:
            print_error(f"405 Method Not Allowed: {request.method} {request.url}")
            return JSONResponse(
                status_code=405,
                content={
                    "detail": "Method Not Allowed",
                    "method": request.method,
                    "url": str(request.url),
                },
            )
        return response
