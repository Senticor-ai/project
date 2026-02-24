import json
import os
import time
from contextlib import asynccontextmanager
from http import HTTPStatus

from fastapi import FastAPI, HTTPException, Request
from fastapi.exception_handlers import (
    http_exception_handler,
    request_validation_exception_handler,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse, Response
from slowapi.errors import RateLimitExceeded

from .chat import router as chat_router
from .config import settings
from .csrf import should_validate_csrf, validate_csrf_request
from .db import db_conn
from .deps import ORG_ID_HEADER
from .email import routes as email_routes
from .metrics import (
    dec_in_flight_requests,
    inc_in_flight_requests,
    metrics_content_type,
    metrics_payload,
    observe_http_request,
    refresh_queue_metrics,
)
from .observability import (
    REQUEST_ID_HEADER,
    TRAIL_ID_HEADER,
    USER_ID_HEADER,
    bind_request_context,
    bind_user_context,
    clear_request_context,
    configure_logging,
    generate_request_id,
    generate_trail_id,
    get_logger,
)
from .rate_limit import limiter
from .routes import (
    agent_settings,
    assertions,
    auth,
    collaboration,
    dev,
    files,
    imports,
    items,
    orgs,
    push,
    schemas,
    search,
)
from .tracing import configure_tracing, shutdown_tracing

configure_logging()
logger = get_logger("app")


def _resolve_route_and_handler(request: Request) -> tuple[str | None, str | None]:
    route_template: str | None = None
    handler_name: str | None = None

    route = request.scope.get("route")
    if route is not None:
        route_template = getattr(route, "path", None) or getattr(route, "path_format", None)

    endpoint = request.scope.get("endpoint")
    if callable(endpoint):
        handler_name = getattr(endpoint, "__qualname__", None) or getattr(
            endpoint, "__name__", None
        )

    return route_template, handler_name


def _summarize_error_reason(detail: object) -> str:
    if isinstance(detail, str):
        return detail
    if isinstance(detail, dict):
        nested = detail.get("detail")
        if isinstance(nested, str):
            return nested
    text = str(detail)
    if len(text) <= 200:
        return text
    return f"{text[:200]}..."


def _infer_error_reason_from_response(response: Response | None, status_code: int) -> str:
    if response is not None:
        body = getattr(response, "body", None)
        if isinstance(body, (bytes, bytearray)) and body:
            decoded = body.decode("utf-8", errors="replace")
            try:
                payload = json.loads(decoded)
            except json.JSONDecodeError:
                payload = decoded
            if isinstance(payload, dict) and "detail" in payload:
                return _summarize_error_reason(payload.get("detail"))
            if isinstance(payload, str):
                stripped = payload.strip()
                if stripped:
                    return _summarize_error_reason(stripped)
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return f"HTTP {status_code}"


def _bind_user_context_from_request_state(request: Request) -> None:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        return
    bind_user_context(
        str(user_id),
        session_id=getattr(request.state, "session_id", None),
    )


@asynccontextmanager
async def lifespan(application: FastAPI):
    worker_id = os.environ.get("UVICORN_WORKER_ID") or os.environ.get("WORKER_ID") or "main"
    port = os.environ.get("PORT") or os.environ.get("UVICORN_PORT") or "8000"
    logger.info(
        "app.startup",
        pid=os.getpid(),
        worker_id=worker_id,
        port=port,
    )
    tracer_provider = configure_tracing(application)
    try:
        yield
    finally:
        shutdown_tracing(tracer_provider)
        logger.info(
            "app.shutdown",
            pid=os.getpid(),
            worker_id=worker_id,
            port=port,
        )


app = FastAPI(
    title="Senticor Project API",
    version="0.1.0",
    description=(
        "Session-authenticated API with structured logging. "
        "Clients should preserve the session cookie and may include "
        "`X-Request-ID` for request correlation (otherwise it is generated). "
        "`X-User-ID` is optional and used only for log context; auth is always "
        "derived from the session cookie. When CSRF is enabled, clients must "
        "include `X-CSRF-Token` on state-changing requests."
    ),
    openapi_version="3.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Attach rate limiter to app state for SlowAPI
app.state.limiter = limiter

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=settings.cors_methods,
    allow_headers=settings.cors_headers,
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get(REQUEST_ID_HEADER) or generate_request_id()
    trail_id = request.headers.get(TRAIL_ID_HEADER) or generate_trail_id()
    bind_request_context(request_id, request.method, request.url.path, trail_id=trail_id)
    user_id_header = request.headers.get(USER_ID_HEADER)
    if user_id_header:
        bind_user_context(user_id_header)
        request.state.user_id = user_id_header
    request.state.request_id = request_id
    request.state.trail_id = trail_id
    start = time.monotonic()
    skip_http_metrics = request.url.path == "/metrics"
    if not skip_http_metrics:
        inc_in_flight_requests()
    response = None
    status_code: int | None = None

    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception as exc:
        status_code = 500
        request.state.error_reason = str(exc)
        route_template, handler_name = _resolve_route_and_handler(request)
        logger.exception(
            "request.failed",
            method=request.method,
            path=request.url.path,
            route=route_template,
            handler=handler_name,
            error_reason=str(exc),
        )
        raise
    finally:
        duration_ms = int((time.monotonic() - start) * 1000)
        route_template, handler_name = _resolve_route_and_handler(request)
        error_reason = getattr(request.state, "error_reason", None)
        if status_code is not None and status_code >= 400 and not error_reason:
            error_reason = _infer_error_reason_from_response(response, status_code)
        _bind_user_context_from_request_state(request)
        if not skip_http_metrics:
            observe_http_request(
                request=request,
                status_code=status_code,
                duration_seconds=duration_ms / 1000.0,
            )
            dec_in_flight_requests()
        logger.info(
            "request.completed",
            method=request.method,
            path=request.url.path,
            route=route_template,
            handler=handler_name,
            status_code=status_code,
            duration_ms=duration_ms,
            error_reason=error_reason,
        )
        clear_request_context()

    response.headers[REQUEST_ID_HEADER] = request_id
    response.headers[TRAIL_ID_HEADER] = trail_id
    return response


@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if settings.csrf_enabled and should_validate_csrf(request):
        validate_csrf_request(request)
    return await call_next(request)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    if settings.security_headers_enabled:
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if settings.hsts_enabled:
            response.headers["Strict-Transport-Security"] = (
                f"max-age={settings.hsts_max_age}; includeSubDomains; preload"
            )
        if settings.csp_policy:
            response.headers["Content-Security-Policy"] = settings.csp_policy
    return response


_logger_security = get_logger("security")
if settings.security_headers_enabled:
    _logger_security.info(
        "security_headers.enabled",
        hsts=settings.hsts_enabled,
        csp=bool(settings.csp_policy),
    )


@app.exception_handler(HTTPException)
async def http_exception_with_request_id(request: Request, exc: HTTPException):
    request.state.error_reason = _summarize_error_reason(exc.detail)
    response = await http_exception_handler(request, exc)
    response.headers[REQUEST_ID_HEADER] = getattr(request.state, "request_id", "")
    response.headers[TRAIL_ID_HEADER] = getattr(request.state, "trail_id", "")
    return response


@app.exception_handler(RequestValidationError)
async def validation_exception_with_request_id(
    request: Request,
    exc: RequestValidationError,
):
    request.state.error_reason = "Request validation failed"
    response = await request_validation_exception_handler(request, exc)
    response.headers[REQUEST_ID_HEADER] = getattr(request.state, "request_id", "")
    response.headers[TRAIL_ID_HEADER] = getattr(request.state, "trail_id", "")
    return response


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exception_handler(request: Request, exc: RateLimitExceeded):
    request.state.error_reason = "Rate limit exceeded"
    logger.warning(
        "rate_limit.exceeded",
        method=request.method,
        path=request.url.path,
        remote_addr=request.client.host if request.client else None,
    )
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded"},
        headers={
            "Retry-After": "60",
            REQUEST_ID_HEADER: getattr(request.state, "request_id", ""),
            TRAIL_ID_HEADER: getattr(request.state, "trail_id", ""),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_with_request_id(request: Request, exc: Exception):
    request.state.error_reason = "Internal Server Error"
    logger.exception("unhandled.exception")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
        headers={
            REQUEST_ID_HEADER: getattr(request.state, "request_id", ""),
            TRAIL_ID_HEADER: getattr(request.state, "trail_id", ""),
        },
    )


app.include_router(auth.router)
app.include_router(items.router)
app.include_router(collaboration.router)
app.include_router(imports.router)
app.include_router(assertions.router)
app.include_router(files.router)
app.include_router(orgs.router)
app.include_router(push.router)
app.include_router(schemas.router)
app.include_router(search.router)
app.include_router(chat_router)
app.include_router(agent_settings.router)
app.include_router(email_routes.router)
app.include_router(dev.router)


def _header_present(parameters: list[dict], name: str) -> bool:
    for param in parameters:
        if "$ref" in param:
            if param["$ref"].endswith(f"/{name}"):
                return True
            continue
        if param.get("in") == "header" and param.get("name") == name:
            return True
    return False


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema

    schema = get_openapi(
        title=app.title,
        version=app.version,
        description=app.description,
        routes=app.routes,
    )

    components = schema.setdefault("components", {})
    parameters = components.setdefault("parameters", {})
    parameters[REQUEST_ID_HEADER] = {
        "name": REQUEST_ID_HEADER,
        "in": "header",
        "required": False,
        "schema": {"type": "string"},
        "description": (
            "Optional request id for correlation. "
            "If omitted, the server generates one and echoes it back."
        ),
    }
    parameters[USER_ID_HEADER] = {
        "name": USER_ID_HEADER,
        "in": "header",
        "required": False,
        "schema": {"type": "string", "format": "uuid"},
        "description": (
            "Optional user id for log context only. Auth is always derived from the session cookie."
        ),
    }
    parameters[TRAIL_ID_HEADER] = {
        "name": TRAIL_ID_HEADER,
        "in": "header",
        "required": False,
        "schema": {"type": "string", "format": "uuid"},
        "description": (
            "Optional trail id for end-to-end correlation across subsystems. "
            "If omitted, the server generates one and echoes it back."
        ),
    }
    parameters[settings.csrf_header_name] = {
        "name": settings.csrf_header_name,
        "in": "header",
        "required": False,
        "schema": {"type": "string"},
        "description": (
            "CSRF token required for state-changing requests when CSRF is enabled. "
            "Must match the CSRF cookie."
        ),
    }
    parameters[ORG_ID_HEADER] = {
        "name": ORG_ID_HEADER,
        "in": "header",
        "required": False,
        "schema": {"type": "string", "format": "uuid"},
        "description": (
            "Optional org context for multi-tenant requests. "
            "If omitted, the user's default org is used when available."
        ),
    }

    security_schemes = components.setdefault("securitySchemes", {})
    security_schemes["cookieAuth"] = {
        "type": "apiKey",
        "in": "cookie",
        "name": settings.session_cookie_name,
        "description": "Session cookie for BFF authentication.",
    }
    security_schemes["refreshCookie"] = {
        "type": "apiKey",
        "in": "cookie",
        "name": settings.session_refresh_cookie_name,
        "description": "Refresh cookie for rotating short-lived sessions.",
    }

    schema.setdefault("security", [{"cookieAuth": []}])

    csrf_exempt_paths = {"/auth/login", "/auth/register", "/auth/refresh", "/auth/csrf"}

    for path, path_item in schema.get("paths", {}).items():
        for method, operation in path_item.items():
            if method not in {
                "get",
                "post",
                "put",
                "delete",
                "patch",
                "options",
                "head",
                "trace",
            }:
                continue
            parameters_list = operation.setdefault("parameters", [])
            if not _header_present(parameters_list, REQUEST_ID_HEADER):
                parameters_list.append({"$ref": f"#/components/parameters/{REQUEST_ID_HEADER}"})
            if not _header_present(parameters_list, USER_ID_HEADER):
                parameters_list.append({"$ref": f"#/components/parameters/{USER_ID_HEADER}"})
            if not _header_present(parameters_list, TRAIL_ID_HEADER):
                parameters_list.append({"$ref": f"#/components/parameters/{TRAIL_ID_HEADER}"})
            if not _header_present(parameters_list, ORG_ID_HEADER):
                parameters_list.append({"$ref": f"#/components/parameters/{ORG_ID_HEADER}"})
            if (
                method not in {"get", "head", "options", "trace"}
                and path not in csrf_exempt_paths
                and not _header_present(parameters_list, settings.csrf_header_name)
            ):
                parameters_list.append(
                    {"$ref": f"#/components/parameters/{settings.csrf_header_name}"}
                )

    for path, path_item in schema.get("paths", {}).items():
        for method, operation in path_item.items():
            if method not in {
                "get",
                "post",
                "put",
                "delete",
                "patch",
                "options",
                "head",
                "trace",
            }:
                continue
            if path in {"/auth/login", "/auth/register", "/auth/csrf", "/health", "/"}:
                operation["security"] = []
            elif path == "/auth/refresh":
                operation["security"] = [{"refreshCookie": []}]
            else:
                operation.setdefault("security", [{"cookieAuth": []}])

    app.openapi_schema = schema
    return app.openapi_schema


app.openapi = custom_openapi  # type: ignore[method-assign]


@app.get("/")
def root():
    return {
        "name": app.title,
        "version": app.version,
        "docs": "/docs",
        "redoc": "/redoc",
        "openapi": "/openapi.json",
    }


@app.get("/.well-known/openapi")
def well_known_openapi():
    return {
        "openapi": "/openapi.json",
        "docs": "/docs",
        "redoc": "/redoc",
    }


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/metrics", include_in_schema=False)
def prometheus_metrics():
    refresh_queue_metrics()
    return Response(content=metrics_payload(), media_type=metrics_content_type())


@app.get("/health/schema")
def schema_health_check():
    required_tables = [
        "items",
        "files",
        "search_index_jobs",
        "import_jobs",
        "outbox_events",
    ]
    missing: list[str] = []
    with db_conn() as conn:
        with conn.cursor() as cur:
            for table in required_tables:
                cur.execute("SELECT to_regclass(%s) AS reg", (table,))
                row = cur.fetchone()
                if row is None or row.get("reg") is None:
                    missing.append(table)

    warnings: list[str] = []
    if "search_index_jobs" in missing:
        warnings.append("search_index_jobs missing: file upload indexing queue disabled")
    if "import_jobs" in missing:
        warnings.append("import_jobs missing: async imports disabled")
    status = "ok" if not missing else "degraded"
    return {"status": status, "missing_tables": missing, "warnings": warnings}
