import typing
import uuid

from sqlalchemy import text
from sqlalchemy.orm import Session

from libs.acl.methods import create_default_acls_by_id
from libs.acl.models import Who
from libs.db import context_db
from libs.resource import Resource

from .models import Folder, FolderToResource


def get_subfolders(
    *,
    folder_id: uuid.UUID,
    _db: Session | None = None,
):
    """
    Use CTE to get all the folders recursively.
    """

    query = text(
        """
    WITH RECURSIVE subfolders AS (
        SELECT id, name, parent_id FROM folders WHERE id = :folder_id
        UNION ALL
        SELECT f.id, f.name, f.parent_id FROM folders f, subfolders
        WHERE f.parent_id = subfolders.id
    )
    SELECT * FROM subfolders
    WHERE id != :folder_id;
    """
    )

    with context_db(_db) as db:
        sequence = db.execute(
            query,
            {
                "folder_id": folder_id,
            },
        ).all()
        result = [row._asdict() for row in sequence]
        return result


def get_subfolders_and_resources(
    *,
    folder_id: uuid.UUID,
    _db: Session | None = None,
):
    """
    Use CTE to get all the folders recursively and JOIN the FolderToResource to get resource_kind and resource_id too
    """

    # 3 CTEs (Common Table Expressions) are used here:
    # 1) subfolders: Get all the folders recursively
    # 2) aggregated_relation: Get all the resources in the folder
    # 3) aggregated_children: Get all the children of the folder
    # The final SELECT statement joins the 3 CTEs to get the final result
    query = text(
        """
    WITH RECURSIVE subfolders AS (
        SELECT id, name, parent_id, for_kind, for_id FROM folders WHERE id = :folder_id
        UNION ALL
        SELECT f.id, f.name, f.parent_id, f.for_kind, f.for_id FROM folders f, subfolders
        WHERE f.parent_id = subfolders.id
    ),
    aggregated_relation AS (
        SELECT
            folder_id,
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'id', resource_id::text,
                    'kind', resource_kind
                )
            ) AS resources
        FROM relation_folders_blocks
        GROUP BY folder_id
    ),
    aggregated_children AS (
        SELECT
            parent_id,
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'id', id::text,
                    'name', name
                    -- Add more properties of the child folders here if needed
                )
            ) AS children
        FROM subfolders
        WHERE parent_id IS NOT NULL
        GROUP BY parent_id
    )
    SELECT
        subfolders.*,
        COALESCE(aggregated_relation.resources, '[]'::json) AS resources,
        COALESCE(aggregated_children.children, '[]'::json) AS children
    FROM subfolders
    LEFT JOIN aggregated_relation ON aggregated_relation.folder_id = subfolders.id
    LEFT JOIN aggregated_children ON aggregated_children.parent_id = subfolders.id;
    """
    )

    with context_db(_db) as db:
        sequence = db.execute(
            query,
            {
                "folder_id": folder_id,
            },
        ).all()
        result = [row._asdict() for row in sequence]
        return result


def add_to_folder(
    *,
    folder_id: uuid.UUID,
    resource: Resource,
    _db: Session | None = None,
) -> None:
    # 1) Check if already in the folder
    with context_db(_db) as db:
        already_in_folder = (
            db.query(FolderToResource)
            .filter(
                FolderToResource.folder_id == folder_id,
                FolderToResource.resource_kind == resource.__kind__,
                FolderToResource.resource_id == resource.id,
            )
            .first()
        )
        if already_in_folder:
            return

    # 2) If not, add it to the folder
    with context_db(_db) as db:
        db.add(
            FolderToResource(
                folder_id=folder_id,
                resource_kind=resource.__kind__,
                resource_id=resource.id,
            )
        )
        db.commit()


def remove_from_folder(
    *,
    folder_id: uuid.UUID,
    resource: Resource,
    _db: Session | None = None,
) -> None:
    with context_db(_db) as db:
        folder_to_resource = (
            db.query(FolderToResource)
            .filter(
                FolderToResource.folder_id == folder_id,
                FolderToResource.resource_kind == resource.__kind__,
                FolderToResource.resource_id == resource.id,
            )
            .first()
        )

        if folder_to_resource:
            db.delete(folder_to_resource)
            db.commit()


def get_folder_children(
    *,
    folder_id: uuid.UUID,
    _db: Session | None = None,
) -> list[FolderToResource]:
    with context_db(_db) as db:
        children = db.query(FolderToResource).filter(FolderToResource.folder_id == folder_id).all()
        return children


def share_folder_with(
    *,
    folder_id: uuid.UUID,
    who: Who | str,
    who_id: typing.Optional[uuid.UUID] = None,
    create_read_acl: bool = True,
    create_write_acl: bool = True,
    create_delete_acl: bool = True,
    _db: Session | None = None,
) -> None:
    create_default_acls_by_id(
        resource_id=folder_id,
        resource_kind=Folder.__kind__,
        who=who,
        who_id=who_id,
        create_read_acl=create_read_acl,
        create_write_acl=create_write_acl,
        create_delete_acl=create_delete_acl,
    )
