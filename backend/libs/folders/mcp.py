"""
MCP tools for the folders domain.

Import this module in your MCP app and call ``register_folder_mcp_tools`` to
expose folder management capabilities to MCP clients.

Note: basic list/get operations are handled by the generic CRUD proxy
(``enlist_crud_operations_as_mcp_tools``).  Only domain-specific tools that
require custom logic live here.
"""

import uuid

from mcp.server.fastmcp import FastMCP

from libs.acl.methods import can
from libs.acl.models import Operation, Who
from libs.db import context_db
from libs.endpoints.endpoints import apply_operation_access_filter
from libs.logger.customLogger import print_color
from libs.mcp.auth import get_user_from_token

from .methods import add_to_folder, share_folder_with
from .models import Folder, FolderToResource


def _parse_uuid(value: str, field_name: str) -> tuple[uuid.UUID | None, dict | None]:
    try:
        return uuid.UUID(value), None
    except ValueError:
        return None, {"error": "invalid_uuid", "message": f"Invalid UUID for {field_name}: '{value}'."}


def register_folder_mcp_tools(mcp: FastMCP) -> None:
    """
    Register folder-related MCP tools on *mcp*.

    Note: create/list/get are handled by the generic CRUD proxy.  Only tools
    with custom logic that the REST CRUD endpoints cannot express live here.

    Args:
        mcp: The FastMCP server instance to register tools on.
    """

    @mcp.tool()
    def add_resource_to_folder(
        folder_id: str,
        resource_id: str,
        resource_kind: str,
        auth_token: str,
    ) -> dict:
        """
        Place any resource (article, dataset, RF, perimeter, …) into an existing folder.

        Folders are universal containers: any object that has an ``id`` and a ``kind``
        can be placed inside one.  Always copy the ``id`` and ``kind`` values directly
        from the output of the list_* or get_* tool that retrieved the resource — never
        guess or fabricate the kind string.

        When to use this vs alternatives:
        - Use ``add_resource_to_folder`` to add an already-existing resource to a folder
          by its UUID and kind.
        - Use ``create_folder`` (generic CRUD) first if the target folder does not exist yet.
        - Use ``get_folder_items`` to inspect what is already inside a folder before adding.

        Requires authentication; the caller must have WRITE access on the target folder.

        Success / retry guidance:
        - SUCCESS: response has `status: "added"`.
        - RETRY if `error: forbidden`: the caller lacks WRITE access on the folder — check ownership via `list_folder`.
        - RETRY if `error: invalid_uuid`: the `folder_id` or `resource_id` is not a valid UUID — retrieve the UUID via the appropriate `list_*` or `get_*` tool first.

        Args:
            folder_id: UUID of the destination folder,
                       e.g. ``"3fa85f64-5717-4562-b3fc-2c963f66afa6"``.
            resource_id: UUID of the resource to add,
                         e.g. ``"9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"``.
            resource_kind: Exact ``kind`` string of the resource as returned by the
                tool that fetched it, e.g. ``"article"``, ``"dataset"``, ``"rf"``,
                ``"perimeter"``.  Do not invent this value.
            auth_token: JWT bearer token obtained from ``login``.

        Returns:
            ``{"folder_id": "<uuid>", "resource_id": "<uuid>", "resource_kind": "article", "status": "added"}``
            or an error dict with ``"error"`` and ``"message"`` keys.

        Example prompts:
        - "Add article 9b1deb4d-... to folder 3fa85f64-...".
        - "Put that RF into the Q1 perimeters folder."
        """
        print_color("cyan", f"[MCP] add_resource_to_folder: folder_id={folder_id!r} resource_id={resource_id!r} kind={resource_kind!r} auth={bool(auth_token)}")
        user = get_user_from_token(auth_token)
        if not user:
            print_color("yellow", "[MCP] add_resource_to_folder: unauthorized")
            return {"error": "unauthorized", "message": "Invalid or missing auth_token."}

        parsed_folder_id, err = _parse_uuid(folder_id, "folder_id")
        if err:
            return err
        parsed_resource_id, err = _parse_uuid(resource_id, "resource_id")
        if err:
            return err

        if not can(who_id=user.id, resource_type=Folder.__kind__, resource_id=parsed_folder_id, what=Operation.WRITE):
            print_color("yellow", f"[MCP] add_resource_to_folder: user lacks WRITE on folder {folder_id!r}")
            return {"error": "forbidden", "message": f"User does not have WRITE access to folder {folder_id}."}

        class _ResourceProxy:
            __kind__ = resource_kind
            id = parsed_resource_id

        add_to_folder(folder_id=parsed_folder_id, resource=_ResourceProxy())  # type: ignore[arg-type]
        print_color("cyan", f"[MCP] add_resource_to_folder: done")
        return {"folder_id": folder_id, "resource_id": resource_id, "resource_kind": resource_kind, "status": "added"}

    @mcp.tool()
    def share_folder_with_team(folder_id: str, team_id: str, auth_token: str) -> dict:
        """
        Grant a team read/write/delete ACL access to a folder.

        After this call, every member of the target team can read, write, and delete
        the folder and the resources it contains, according to their own ACLs.

        When to use this vs alternatives:
        - Use ``share_folder_with_team`` when you want to grant team-wide access to an
          entire folder at once.
        - Use ``add_resource_to_folder`` to place an individual resource into a folder
          without changing who has access to the folder itself.
        - To discover team IDs, call ``list_team`` first.

        Requires authentication; the caller must have WRITE access on the folder.

        Success / retry guidance:
        - SUCCESS: response has `status: "shared"`.
        - RETRY if `error: forbidden`: the caller lacks WRITE access on the folder.
        - RETRY if `error: invalid_uuid`: use `list_folder` or `list_team` to retrieve correct UUIDs.

        Args:
            folder_id: UUID of the folder to share,
                       e.g. ``"3fa85f64-5717-4562-b3fc-2c963f66afa6"``.
            team_id:   UUID of the team to grant access to,
                       e.g. ``"2c963f66-afa6-4562-b3fc-3fa85f645717"``.
            auth_token: JWT bearer token obtained from ``login``.

        Returns:
            ``{"folder_id": "<uuid>", "team_id": "<uuid>", "status": "shared"}``
            or an error dict with ``"error"`` and ``"message"`` keys.

        Example prompts:
        - "Share the Q1 folder with the Operations team."
        - "Give team 2c963f66-... access to folder 3fa85f64-...".
        """
        print_color("cyan", f"[MCP] share_folder_with_team: folder_id={folder_id!r} team_id={team_id!r} auth={bool(auth_token)}")
        user = get_user_from_token(auth_token)
        if not user:
            print_color("yellow", "[MCP] share_folder_with_team: unauthorized")
            return {"error": "unauthorized", "message": "Invalid or missing auth_token."}

        parsed_folder_id, err = _parse_uuid(folder_id, "folder_id")
        if err:
            return err
        parsed_team_id, err = _parse_uuid(team_id, "team_id")
        if err:
            return err

        if not can(who_id=user.id, resource_type=Folder.__kind__, resource_id=parsed_folder_id, what=Operation.WRITE):
            print_color("yellow", f"[MCP] share_folder_with_team: user lacks WRITE on folder {folder_id!r}")
            return {"error": "forbidden", "message": f"User does not have WRITE access to folder {folder_id}."}

        share_folder_with(folder_id=parsed_folder_id, who=Who.team, who_id=parsed_team_id)
        print_color("cyan", f"[MCP] share_folder_with_team: done")
        return {"folder_id": folder_id, "team_id": team_id, "status": "shared"}

    @mcp.tool()
    def get_folder_items(folder_id: str, auth_token: str | None = None) -> dict:
        """
        List every resource (id + kind) stored inside a specific folder.

        Use ``list_folder`` first to enumerate available folders and obtain a
        ``folder_id``, then call this tool to inspect the contents.

        When to use this vs alternatives:
        - Use ``get_folder_items`` to see what is inside a known folder (the contents,
          not the folder metadata).
        - Use ``get_folder`` (generic CRUD, by UUID) to retrieve folder metadata such as
          name and owner without enumerating contents.
        - Use ``list_folder`` to search or page through all folders visible to the caller.

        Success / retry guidance:
        - SUCCESS: response contains a `contents` list (may be empty if the folder exists but has no items).
        - RETRY if `error: not_found`: the `folder_id` is wrong — call `list_folder` to find the correct UUID.

        Args:
            folder_id: UUID of the folder to inspect,
                       e.g. ``"3fa85f64-5717-4562-b3fc-2c963f66afa6"``.
            auth_token: Optional JWT bearer token from ``login``.  Omit to access
                        only publicly visible folders.

        Returns:
            ``{
                "folder":   {"id": "<uuid>", "name": "My Folder"},
                "contents": [{"resource_id": "<uuid>", "resource_kind": "article"}, ...]
            }``
            or ``{"error": "not_found", "message": "Folder <id> not found or not accessible."}``.

        Example prompts:
        - "What is inside folder 3fa85f64-...?"
        - "List the contents of the Q1 perimeters folder."
        """
        print_color("cyan", f"[MCP] get_folder_items: folder_id={folder_id!r} auth={bool(auth_token)}")
        parsed_folder_id, err = _parse_uuid(folder_id, "folder_id")
        if err:
            return err

        user = get_user_from_token(auth_token)

        with context_db() as db:
            folder_query = db.query(Folder).filter(Folder.id == parsed_folder_id)
            folder_query = apply_operation_access_filter(
                query=folder_query,
                ResourceClass=Folder,
                current_user_db=user,
                session=None,
                operation=Operation.READ,
            )
            folder = folder_query.first()
            if not folder:
                print_color("yellow", f"[MCP] list_folder_contents: folder {folder_id!r} not found or not accessible")
                return {"error": "not_found", "message": f"Folder {folder_id} not found or not accessible."}

            items: list[FolderToResource] = (
                db.query(FolderToResource).filter(FolderToResource.folder_id == parsed_folder_id).all()
            )

        print_color("cyan", f"[MCP] get_folder_items: folder {folder.name!r} has {len(items)} items")
        return {
            "folder": {"id": str(folder.id), "name": folder.name},
            "contents": [{"resource_id": str(item.resource_id), "resource_kind": item.resource_kind} for item in items],
        }
