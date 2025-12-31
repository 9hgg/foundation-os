from fastapi import status

from libs.endpoints import create_crud_endpoints
from libs.utils.types import EndpointOutput

from .models import Article


def create_crud_article_router(prefix: str = "/api/articles"):
    crud_article_router = create_crud_endpoints(
        Article,
        prefix=prefix,
        tags=["articles"],
        include_create=True,
        include_update=True,
        include_delete=True,
        include_simplified=True,
    )

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
