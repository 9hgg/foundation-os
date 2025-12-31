from libs.endpoints import create_crud_endpoints

from .models import DesignSystem


def create_crud_design_systems_router(prefix: str = "/api/design-systems"):
    crud_design_system_router = create_crud_endpoints(
        DesignSystem,
        prefix=prefix,
        tags=["design_systems"],
        include_update=True,
        include_delete=True,
        include_create=True,
        include_patch=True,
        include_read=True,
    )

    return crud_design_system_router
