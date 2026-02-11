---
applyTo: "**"
---

# Copilot instructions: backend (FastAPI + SQLModel)

These directives guide Copilot when proposing code for the `backend/` workspace.
Keep suggestions aligned with our FastAPI stack, SQLModel, Alembic, and existing libs.

## Project facts

- Runtime: Python ≥3.12, uv for env and task runner
- Note: Starting with Python ≥3.12 the `from __future__ import annotations` statement is no longer necessary. Prefer omitting it in new scripts (it's harmless but redundant and mainly kept for older-version compatibility).
- Framework: FastAPI (Starlette), Pydantic v2, SQLAlchemy 2.x, SQLModel
- Each resource follows the same structure:
  - APIs live under `libs/*/api.py` and are assembled in `apps/{app-name}/app.py` (depends on the app)
  - generic methods belongs in `libs/{resource-name}/methods.py`;
  - models belong in `libs/{resource-name}/models.py`
  - constants python objects belong in `libs/{resource-name}/constants.py`
  - deps (for fastapi endpoints) belong in `libs/{resource-name}/deps.py`
- Config via Pydantic Settings loaded from `.env` in `apps/{app-name}/configs/default.py`
- Tooling: Alembic (SQLite/Postgres configs), pytest, ruff, deptry, mypy (via Makefile)
- most libs should be independent of each others (unless obvious like a team depend on users).
- Most resource depends on the Resource class defined in `backend/libs/resource/resource.py`.
- Resources have automatic REST Api through `create_crud_endpoints` defined in `backend/libs/endpoints/endpoints.py`
- By using pydantic v2 almost everywhere there is no reason to use getattr and hasattr methods. Besides properties may be None as explicitely defined through pydantic, so there is no need to do `someresource.config or None`.

## API patterns (prefer these)

- Endpoints return `EndpointOutput[T]` from `libs.utils.types`.
  - On errors, set `EndpointOutput(error=EndpointError(...))` instead of raising, unless truly exceptional.
- Use typed responses: `async def endpoint(...) -> EndpointOutput[YourType]: ...`
- Always wire dependencies with `Depends(...)` from `libs.users.deps`, `libs.sessions.deps`, `libs.i18n.deps` when auth/session/translation are needed.
- When possible, expose CRUD via your lib’s `create_crud_*_router()` and put custom methods in `methods.py`.
- If you create specific models (e.g for api response) consider placing them in `models.py` and reusing them across your endpoints.
- always put imports at the top of the file.
- Avoid inline imports inside function bodies unless necessary (for lazy loading to resolve circular imports or to avoid importing very heavy optional dependencies). If you must use an inline import, add a short comment explaining why.

## Secured Endpoints (Admin & Email Verification)

When creating endpoints restricted to admins or requiring email verification, follow this pattern (see `libs.i18n.api` for examples):

1.  Use `classic_deps: ClassicDeps__dep` to access `current_user_db`.
2.  **Order of checks matters**:
    1.  Check if `current_user_db` exists AND `email_verified` is true.
    2.  Check if `current_user_db.email` is in `ENDPOINTS_SETTINGS.ADMIN_EMAILS` (for admin routes).
3.  Return consistent `EndpointError`:

    ```python
    from libs.endpoints.config import ENDPOINTS_SETTINGS
    from libs.utils.deps import ClassicDeps__dep

    @router.post("/your-admin-route")
    async def admin_action(classic_deps: ClassicDeps__dep):
        current_user_db, _, _ = classic_deps

        # 1. Check email verification
        if not current_user_db or not current_user_db.email_verified:
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized ... (email not verified)",
                    code="unauthorized",
                )
            )

        # 2. Check admin status
        if not current_user_db or current_user_db.email not in ENDPOINTS_SETTINGS.ADMIN_EMAILS:
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="You are not authorized ... (email not in admin list)",
                    code="unauthorized",
                )
            )

        # ... Action logic ...
    ```

## Data models and serialization

- Use SQLModel/Pydantic v2. Base configs provided in `libs.utils.types`:
  - `SQLMODEL_BASE_CONFIG_DICT`, `PYDANTIC_BASE_CONFIG_DICT`, `BaseModelWithConfig`
  - Field aliasing uses camelCase for JSON (via `to_camel`). Keep Python attributes snake_case. The Pydantic object will automatically convert to camelCase when serialized for the frontend.
- Prefer `model_dump()` (Pydantic v2) and avoid legacy `.dict()`.

## Config and environment

- See the `backend/apps/spoken/app.py` for a full app creation with config.
- When creating utility scripts : we use typer :
  - always default to listing help message if no argument is set. It means that that we must have the no_args_is_help=True in the typer.Typer() constructor.
  - You can find some examples in `backend/libs/users/scripts/email_verification_cli.py` or `backend/apps/spoken/pricing/subscription_v0.py`

## ⚠️ CRITICAL: No app-specific strings in libs/

**MANDATORY RULE:** Libraries under `libs/` must be app-agnostic. DO NOT hardcode application-specific values such as:

- Domain names (e.g., "spoken.systems", "curiosity.app", etc.)
- Brand names or app names (e.g., "spOken", "Curiosity", "spOken Team", etc.)
- Application URLs or email addresses with domain

Instead:

- **All application-specific configuration MUST be provided via environment variables** (defined in `.env` files per app)
- Use Pydantic Settings classes (in `libs/{resource}/config.py`) with required fields that have no defaults
- Example: `SENDER_EMAIL: str` (no default) forces apps to provide their own email address
- Pass configured values to library functions; don't hardcode them

This ensures `libs/` can be shared across multiple applications (spoken, curiosity, etc.) without conflicts.

## Logging, CORS, and docs

- Logging is initialized by `libs.logger.customLogger.init_logging()`. Prefer using print_warning, print_error and print (either from the customLogger or rich package) than logging directly.

## Do / Don’t for suggestions

Do:

- Use `EndpointOutput` and `EndpointError` for uniform API responses.
- Write `async` endpoints, type your inputs/outputs, and reuse `methods.py`.
- Use {ResourceName}.{create|patch|update|delete} instead of direct sqlalchemy db.add calls.
- when possible : put new model/interface class in the model files (e.g: libs/users/models.py) to reuse them across your lib.

Don’t:

- Mix app wiring with domain logic; don’t import across unrelated libs.
- Introduce new dependencies if an equivalent exists under `libs/*`.

## Notes for Copilot

- Follow Pydantic v2 conventions; prefer `model_dump` and field aliases.
- Respect library layering: models → methods → api/actions; apps only compose routers and middleware.
- Keep responses consistent and human-readable errors via `EndpointError` with `title`, `description`, `code`. and import the Classic_deps for translation when possible.

## CLI Commands, tools, MCP servers

- Use `uv` directly when possible (instead of absolute python path). You must be in the backend directory to run uv commands w.r.t to the backend. There is also a uv project at the root of the repository but it is more about utility scripts.
- **NEVER use `pip` or `uv pip` directly to add packages.** Always use `uv add` (e.g., `uv add numpy`) to ensure dependencies are properly tracked in `pyproject.toml` and `uv.lock`.
