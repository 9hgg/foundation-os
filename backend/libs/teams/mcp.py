"""
MCP tools for the teams domain.

Import this module in your MCP app and call ``register_team_mcp_tools`` to
expose team capabilities to MCP clients.

Note: basic list/get operations are handled by the generic CRUD proxy
(``enlist_crud_operations_as_mcp_tools``).  Only domain-specific tools that
require custom logic live here.
"""

import structlog
from mcp.server.fastmcp import FastMCP

from libs.teams.methods import get_team_with_members_with_roles

logger = structlog.get_logger(__name__)


def register_team_mcp_tools(mcp: FastMCP) -> None:
    """
    Register team-related MCP tools on *mcp*.

    Args:
        mcp: The FastMCP server instance to register tools on.
    """

    @mcp.tool()
    def get_team_members(team_id: str) -> dict:
        """
        Return the metadata and full member roster (with roles) for a single team.

        Use this when you already have a ``team_id`` and need to know who belongs
        to that team and what role each member holds.  To discover team IDs first,
        call ``list_team`` (paginated list of all teams visible to the caller).

        When to use this vs alternatives:
        - Use ``get_team_members`` when you need the member list with role information
          for a specific team identified by UUID.
        - Use ``get_team`` (generic CRUD) when you only need team metadata (name,
          owner) without the member roster.
        - Use ``list_team`` to enumerate teams when you do not yet have a ``team_id``.

        Success / retry guidance:
        - SUCCESS: response contains a `team` object and a non-empty `members` list.
        - RETRY if `error: not_found`: the `team_id` is wrong or not a UUID — use `list_team` to find the correct UUID first.

        Args:
            team_id: UUID of the team, e.g. ``"3fa85f64-5717-4562-b3fc-2c963f66afa6"``.

        Returns:
            ``{
                "team":    {"id": "<uuid>", "name": "My Team", "owner_id": "<uuid>"},
                "members": [{"user_id": "<uuid>", "role": "admin"}, ...]
            }``
            or ``{"error": "not_found", "message": "Team <id> not found."}``

        Example prompts:
        - "Show me all members of team 3fa85f64-5717-4562-b3fc-2c963f66afa6."
        - "Who is in the Operations team and what are their roles?"
        """
        logger.debug("get_team_members", team_id=str(team_id))
        result = get_team_with_members_with_roles(team_id=team_id)  # type: ignore[arg-type]
        team = result.get("team")
        if not team:
            logger.warning("team_not_found", team_id=str(team_id))
            return {"error": "not_found", "message": f"Team {team_id} not found."}

        logger.debug("team_members_loaded", team_id=str(team_id), member_count=len(result.get("members", [])))
        return {
            "team": {
                "id": str(team.id),
                "name": team.name,
                "owner_id": str(team.owner_id) if team.owner_id else None,
            },
            "members": result.get("members", []),
        }
