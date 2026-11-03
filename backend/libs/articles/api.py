import uuid

from fastapi import status

from libs.acl.methods import create_default_acls
from libs.acl.models import Who
from libs.conversations.models import Conversation
from libs.db import context_db
from libs.endpoints import create_crud_endpoints
from libs.endpoints.types import SimpleResponse
from libs.folders.methods import add_to_folder
from libs.folders.models import Folder
from libs.notifications.methods import notify_admins
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .models import AdminArticleFolderAssignment, Article, SetArticleStateRequest


def _admin_error(classic_deps: ClassicDeps__dep) -> EndpointOutput[None] | None:
    current_user_db, _, translator = classic_deps
    if not current_user_db or not current_user_db.email_verified:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate("Not authorized"),
                description=translator.translate(
                    "You must be logged in with a verified email to manage articles."
                ),
                code="Unauthorized",
            )
        )
    if not current_user_db.is_admin():
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate("Not authorized"),
                description=translator.translate(
                    "You must be an administrator to manage articles."
                ),
                code="Unauthorized",
            )
        )
    return None


def create_crud_article_router(prefix: str = "/api/articles"):  # noqa: C901
    crud_article_router = create_crud_endpoints(
        Article,
        prefix=prefix,
        tags=["articles"],
        include_create=False,
        include_update=True,
        include_patch=True,
        include_delete=True,
        include_simplified=True,
        include_bypass=True,
    )

    @crud_article_router.post(
        "",
        status_code=status.HTTP_200_OK,
        response_model=EndpointOutput[SimpleResponse[Article]],
    )
    async def create_article(
        article_in: Article,
        classic_deps: ClassicDeps__dep,
    ):
        """Create an article, remembering who wrote it.

        The generic CRUD create leaves ``author_id`` empty, which loses the one thing a support
        ticket needs: who is asking. Admins are told about a ticket as soon as it exists, since a
        ticket whose author never posts a message would otherwise arrive in silence.
        """
        current_user_db, _, translator = classic_deps
        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate("You must be logged in to create an article."),
                    code="Unauthorized",
                )
            )

        article_in.author_id = current_user_db.id
        article_db = Article.create(obj=article_in)
        create_default_acls(
            resource=article_db,
            who=Who.user,
            who_id=current_user_db.id,
        )

        # A support ticket and a feature request are different things to be told about -- one is
        # someone stuck, the other someone wishing -- and they read differently in a notification
        # list and in a digest. `backlog` is the kind the article displayer already calls a
        # feature request; this just stops the notification calling it a ticket.
        ticket_kinds = {"support": ("ticket", "A new support ticket"),
                        "backlog": ("feature_request", "A new feature request")}
        if article_db.kind in ticket_kinds:
            notification_kind, notification_content = ticket_kinds[article_db.kind]
            notify_admins(
                resource=article_db,
                config={"userId": str(current_user_db.id)},
                kind=notification_kind,
                content=notification_content,
                current_user_db=current_user_db,
                for_key=f"article_{article_db.id}",
            )

        return EndpointOutput(
            result=SimpleResponse(
                data=article_db,
                self=f"/{article_db.id}",
                all=crud_article_router.prefix + "/?page=1",
            )
        )

    @crud_article_router.post(
        "/admin/{article_id}/state",
        status_code=status.HTTP_200_OK,
        response_model=EndpointOutput[Article],
    )
    async def set_article_state_as_admin(
        article_id: uuid.UUID,
        body: SetArticleStateRequest,
        classic_deps: ClassicDeps__dep,
    ):
        """Archive an article, or bring it back.

        Archiving suspends its conversations: what was said stays readable, nothing new is
        accepted. Restoring re-opens them.
        """
        if error := _admin_error(classic_deps):
            return error
        _, _, translator = classic_deps

        if body.state not in (None, "archived"):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invalid state"),
                    description=translator.translate("An article is either live or archived."),
                    code="invalid_state",
                )
            )

        article_db = Article.by_id(article_id)
        if article_db is None:
            return EndpointOutput(
                error=EndpointError(title=translator.translate("Article not found"), code="NotFound")
            )

        updated = Article.patch(obj_id=article_id, update_dict={"state": body.state})
        conversation_status = "disabled" if body.state == "archived" else "active"
        with context_db() as db:
            conversations = db.query(Conversation).filter(Conversation.resource_id == article_id).all()
            for conversation in conversations:
                Conversation.patch(obj_id=conversation.id, update_dict={"status": conversation_status}, _db=db)

        return EndpointOutput(result=updated)

    @crud_article_router.post(
        "/admin/{article_id}/folder",
        status_code=status.HTTP_200_OK,
        response_model=EndpointOutput[Article],
    )
    async def add_article_to_folder_as_admin(
        article_id: uuid.UUID,
        assignment: AdminArticleFolderAssignment,
        classic_deps: ClassicDeps__dep,
    ):
        authorization_error = _admin_error(classic_deps)
        if authorization_error:
            return authorization_error

        article_db = Article.by_id(article_id)
        if not article_db:
            return EndpointOutput(
                error=EndpointError(
                    title="Article not found",
                    description="The requested article does not exist.",
                    code="NotFound",
                )
            )

        if not Folder.by_id(assignment.folder_id):
            return EndpointOutput(
                error=EndpointError(
                    title="Folder not found",
                    description="The selected folder does not exist.",
                    code="NotFound",
                )
            )

        add_to_folder(folder_id=assignment.folder_id, resource=article_db)
        return EndpointOutput(result=article_db)

    @crud_article_router.get(
        "/check-slug/{slug}",
        status_code=status.HTTP_200_OK,
    )
    async def check_slug(
        slug: str,
    ):
        """
        Check if a slug is unique
        """

        article_db = Article.get_first_by(
            slug=slug,
        )

        if article_db:
            return EndpointOutput(
                result={"slugAvailable": False, "slug": slug},
            )
        return EndpointOutput(
            result={"slugAvailable": True, "slug": slug},
        )

    return crud_article_router
