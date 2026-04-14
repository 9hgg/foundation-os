from anyio import to_thread
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.openapi.docs import (
    get_swagger_ui_html,
    get_swagger_ui_oauth2_redirect_html,
)
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import HTMLResponse

import libs.access.api as access_api
import libs.acl.api as acl_api
import libs.articles.api as articles_api
import libs.conversations.api as conversations_api
import libs.endpoints.api as endpoints_api
import libs.files.api as files_api
import libs.folders.api as folders_api
import libs.i18n.api as i18n_api
import libs.interactions.api as interactions_api
import libs.edf_project_rands.api as edf_project_rands_api
import libs.mails.api as mails_api
import libs.messages.api as messages_api
import libs.notifications.api as notifications_api
import libs.pdfs.api as pdfs_api
import libs.security.api as security_api
import libs.tasks.api as tasks_api
import libs.teams.api as teams_api
import libs.users.api as users_api
from apps.leopar import workers  # noqa: F401
from apps.leopar.configs.default import GLOBAL_APP_SETTINGS
from apps.leopar.fun.ascii import print_leopar_welcome
from libs.auth.providers.auth_provider_manager import AuthProvidersManager
from libs.i18n.deps import Translator__dep
from libs.i18n.translators._generic import dummy_translator
from libs.i18n.translators.argos_translator import get_argos_translator
from libs.i18n.translators.translator_manager import TranslatorsManager
from libs.logger.customLogger import init_logging, print_color
from libs.middlewares import middlewares
from libs.sessions.deps import CurrentSession__dep
from libs.tasks.tasks_manager import TasksManager
from libs.users.deps import CurrentUser__dep
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

TranslatorsManager.enlist_translator("dummy")(dummy_translator)


async def startup():
    limiter = to_thread.current_default_thread_limiter()
    limiter.total_tokens = 1000


# Register translators
TranslatorsManager.enlist_translator("argos")(get_argos_translator())


def get_app_deps(
    request: Request,
    current_user_db: CurrentUser__dep,
    current_session_db: CurrentSession__dep,
    translator: Translator__dep,
):
    request.state.user = current_user_db
    request.state.session = current_session_db
    request.state.translator = translator

    if current_session_db and current_session_db.id:
        # save the session id in the session cookie
        # this operations relies on the sessionMiddleware of starlette
        request.session["appSessionId"] = str(current_session_db.id)


# create fastapi instance and pin swagger version
asgi_app = FastAPI(
    docs_url=None,
    redoc_url=None,
    on_startup=[startup],
    dependencies=[Depends(get_app_deps)],  # ensure that session id is created
)
asgi_app.openapi_version = "3.0.0"


##################################################
#                                                #
#                      DOCS                      #
#                                                #
##################################################


@asgi_app.get("/api-docs", include_in_schema=False)
async def custom_swagger_ui_html(
    current_user_db: CurrentUser__dep,
    translator: Translator__dep,
):
    if current_user_db is None:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate("Not authenticated"),
                description=translator.translate(
                    "You need to be authenticated to see the documentation"
                ),
                code="not_authenticated",
            )
        )

    if not current_user_db.is_admin():
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate("Not authorized"),
                description=translator.translate(
                    "You need to be an admin to see the documentation"
                ),
                code="not_authorized",
            )
        )

    if asgi_app.openapi_url:
        return get_swagger_ui_html(
            openapi_url=asgi_app.openapi_url,
            title=asgi_app.title + " - Swagger UI",
            oauth2_redirect_url=asgi_app.swagger_ui_oauth2_redirect_url,
        )


if asgi_app.swagger_ui_oauth2_redirect_url:

    @asgi_app.get(asgi_app.swagger_ui_oauth2_redirect_url, include_in_schema=False)
    async def swagger_ui_redirect():
        return get_swagger_ui_oauth2_redirect_html()


########## END OF DOCS

init_logging()


##################################################
#                                                #
#                 MIDDLWARES                     #
#                                                #
#            from inside to outside              #
#                                                #
##################################################

# compression middleware
asgi_app.add_middleware(GZipMiddleware, minimum_size=500)

# add cors middleware
asgi_app.add_middleware(
    CORSMiddleware,
    allow_origins="*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# add Logger middleware
asgi_app.add_middleware(middlewares.LoggerMiddleware)

# add 405 middleware
asgi_app.add_middleware(middlewares.Catch405Middleware)

# add Log Device Id header middleware
asgi_app.add_middleware(middlewares.LogDeviceIdMiddleware)

# add Session middleware
asgi_app.add_middleware(
    SessionMiddleware, secret_key=GLOBAL_APP_SETTINGS.SESSION_SECRET
)

# Add the CacheControlMiddleware to set caching headers
asgi_app.add_middleware(
    middlewares.CacheControlMiddleware,
    # not "public, max-age=31536000" because of auth headers
    cache_duration="max-age=31536000",
    exclude_patterns=["/api/", "angular-loader"],
)

# add Timer header middleware
asgi_app.add_middleware(middlewares.ProcessTimeHeader)

########## END OF MIDDLEWARES


##################################################
#                                                #
#                      API                       #
#                                                #
#         This section import the needed         #
#         API endpoints from different libs.     #
#         This listing defines the "app"         #
#                                                #
##################################################


# lib routers
asgi_app.include_router(users_api.create_crud_user_router())
asgi_app.include_router(users_api.create_auth_providers_router())
asgi_app.include_router(endpoints_api.create_dummy_test_endpoints_router())
asgi_app.include_router(interactions_api.create_crud_interaction_router())
asgi_app.include_router(mails_api.create_crud_mail_router())
asgi_app.include_router(i18n_api.create_crud_translation_router())
asgi_app.include_router(files_api.create_crud_file_router())
asgi_app.include_router(access_api.access_router)
asgi_app.include_router(acl_api.create_crud_acl_router())
asgi_app.include_router(tasks_api.create_crud_task_router())
asgi_app.include_router(security_api.create_security_router())
asgi_app.include_router(folders_api.create_crud_folder_router())
asgi_app.include_router(articles_api.create_crud_article_router())
asgi_app.include_router(conversations_api.create_crud_conversation_router())
asgi_app.include_router(messages_api.create_crud_message_router())
asgi_app.include_router(notifications_api.create_crud_notification_router())
asgi_app.include_router(teams_api.create_crud_team_router())
asgi_app.include_router(pdfs_api.create_pdfs_router_with_auth())
asgi_app.include_router(endpoints_api.create_resource_router())
asgi_app.include_router(edf_project_rands_api.create_crud_edf_project_rands_router())

# default API catcher
@asgi_app.get("/api", include_in_schema=False)
@asgi_app.get("/api/{path:path}", include_in_schema=False)
async def api_catcher(path: str = ""):
    return EndpointOutput(
        error=EndpointError(
            title="Not Found",
            code="404",
            description="The requested resource could not be found.",
            details={"path": "/api/" + path, "impasse": "Ceux qui savent savent."},
        )
    )


# handle robots
@asgi_app.get("/robots.txt", response_class=HTMLResponse)
async def serve_robots() -> FileResponse:
    return FileResponse("apps/default/robots.txt", status_code=200)


# handle favicon
@asgi_app.get("/favicon.ico", response_class=HTMLResponse)
async def serve_favicon() -> FileResponse:
    return FileResponse("apps/leopar/assets/favicon.ico", status_code=200)


asgi_app.mount(
    "/assets/",
    StaticFiles(directory="apps/leopar/assets", html=False),
    name="assets",
)


# simple root endpoint for health checks
@asgi_app.get("/", include_in_schema=False)
async def root_endpoint(classic_deps: ClassicDeps__dep):
    (current_user_db, _current_session_db, translator) = classic_deps

    return {
        "message": translator.translate(
            f"Welcome to the {GLOBAL_APP_SETTINGS.APP_NAME} API!"
        ),
        "translator": translator.title,
        "user": {
            "id": str(current_user_db.id) if current_user_db else None,
            "email": (
                current_user_db.email
                if current_user_db and current_user_db.email
                else None
            ),
        },
    }


# Print registered workers and tasks
for worker_name in TasksManager.workers_methods:
    print_color("green", f"- 👷 Registered worker: {worker_name}")
for task_name in TasksManager.tasks_methods:
    print_color("green", f"- ✅ Registered task: {task_name}")
# Print auth providers
for auth_provider_name in AuthProvidersManager.auth_providers:
    print_color("green", f"- 📋 Registered auth provider: {auth_provider_name}")

print_leopar_welcome()
