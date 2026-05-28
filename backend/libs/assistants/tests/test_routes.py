from libs.assistants.methods.routes import (
    AngularMcpRouteDetails,
    build_route_index_from_mcp_route_details,
    extract_angular_mcp_route_details,
)
from libs.mcp.client_runtime.routes import infer_resource_href


def test_extract_angular_mcp_route_details_from_curiosity_config():
    route_details = extract_angular_mcp_route_details(
        "../frontend/apps/curiosity/src/app/app.routes.config.ts"
    )

    def route_for(resource_kind: str, resource_id_param: str):
        return next(
            detail
            for detail in route_details
            if detail.resource_kind == resource_kind and detail.resource_id_param == resource_id_param
        )

    assert route_for("dataset", "id").full_route == "/host/dashboard/datasets/:datasetId/builder"
    assert route_for("file", "null").full_route == "/host/dashboard/files"
    assert route_for("perimeter", "id").full_route == "/host/dashboard/perimeters/:perimeterId/builder"
    assert route_for("rf", "null").full_route == "/host/dashboard/rfs"
    assert route_for("user", "id").full_route == "/host/dashboard/profile"


def test_build_route_index_from_mcp_route_details_uses_explicit_resource_kind_mapping():
    route_index = build_route_index_from_mcp_route_details(
        [
            AngularMcpRouteDetails(
                resource_kind="folder",
                resource_id_param="id",
                full_route="/host/dashboard/files?folderId=:folderId",
                description="Folder route",
            ),
            AngularMcpRouteDetails(
                resource_kind="perimeter",
                resource_id_param="id",
                full_route="/host/dashboard/perimeters/:perimeterId/builder",
                description="Perimeter route",
            ),
        ]
    )

    assert infer_resource_href("folder", "folder-123", route_index) == "/host/dashboard/files?folderId=folder-123"
    assert infer_resource_href("perimeter", "perimeter-456", route_index) == "/host/dashboard/perimeters/perimeter-456/builder"
