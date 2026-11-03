from fastapi import APIRouter

from .release import ReleaseInfo, get_release_info
from .types import EndpointOutput


def create_release_router(prefix: str = "/api/release") -> APIRouter:
    release_router = APIRouter(prefix=prefix, tags=["release"])

    @release_router.get(
        "",
        response_model=EndpointOutput[ReleaseInfo],
        include_in_schema=False,
    )
    async def release() -> EndpointOutput[ReleaseInfo]:
        return EndpointOutput(result=get_release_info())

    return release_router
