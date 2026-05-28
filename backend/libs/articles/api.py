import uuid

from fastapi import status

from libs.endpoints import create_crud_endpoints
from libs.folders.methods import add_to_folder
from libs.folders.models import Folder
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .models import AdminArticleFolderAssignment, Article


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


def create_crud_article_router(prefix: str = "/api/articles"):
    crud_article_router = create_crud_endpoints(
        Article,
        prefix=prefix,
        tags=["articles"],
        include_create=True,
        include_update=True,
        include_patch=True,
        include_delete=True,
        include_simplified=True,
        include_bypass=True,
    )

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
