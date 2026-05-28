"""
MCP tools for the articles domain.

Import this module in your MCP app and call ``register_article_mcp_tools`` to
expose article capabilities to MCP clients.

Note: CRUD operations (list, get, create, update, delete) are handled by the
generic CRUD proxy (``enlist_crud_operations_as_mcp_tools``).  This module only
keeps ``search_articles``: a multi-field OR text search (title | summary |
content) that the generic filter system cannot express as a single query.
"""

import sqlalchemy as sa
from mcp.server.fastmcp import FastMCP

from libs.acl.models import Operation
from libs.db import context_db
from libs.endpoints.endpoints import apply_operation_access_filter
from libs.logger.customLogger import print_color
from libs.mcp.auth import get_user_from_token

from .models import Article


def register_article_mcp_tools(mcp: FastMCP) -> None:
    """
    Register article-related MCP tools on *mcp*.

    Args:
        mcp: The FastMCP server instance to register tools on.
    """

    @mcp.tool()
    def search_articles(query: str = "", auth_token: str | None = None) -> list[dict]:
        """
        Full-text search across article title, summary, and content (OR logic); use this when the query could appear in any of those fields.

        Returns up to 20 articles ordered by ``time_published`` descending.
        The text match is a case-insensitive substring applied with OR across
        title, summary, and content simultaneously.  Results are ACL-filtered.

        When to use this vs alternatives:
        - Use ``search_articles`` when the keyword could appear in the title, the
          summary, or the body and you want OR semantics across all three fields.
        - Use ``list_article`` (generic CRUD) when you need to filter by a specific
          field (e.g. exact ``kind``, ``draft`` status, tag value) or require AND
          semantics across fields.
        - Use ``get_article`` (generic CRUD) when you already have the article UUID.

        Args:
            query: Text to search for, e.g. ``"corrosion"`` or ``"RRI pump"``.
                   Pass an empty string to list the 20 most recently published
                   articles visible to the caller.
            auth_token: Optional JWT bearer token from ``login``.  Omit to search
                        only publicly accessible articles.

        Returns:
            A list of article summaries (newest first, max 20):
            ``[{
                "id": "<uuid>",
                "title": "Corrosion monitoring Q3",
                "slug": "corrosion-monitoring-q3",
                "summary": "...",
                "kind": "report",
                "draft": false,
                "tags": ["maintenance"],
                "time_published": "2024-09-01T00:00:00"
            }, ...]``
            Returns ``[]`` when nothing matches.

        Example prompts:
        - "Search articles about corrosion."
        - "Find the most recent published articles I can see."
        """
        print_color("cyan", f"[MCP] search_articles: query={query!r} auth={bool(auth_token)}")
        user = get_user_from_token(auth_token)
        query = query.strip()

        with context_db() as db:
            base_query = db.query(Article)
            if query:
                base_query = base_query.filter(
                    sa.or_(
                        Article.title.ilike(f"%{query}%"),
                        Article.summary.ilike(f"%{query}%"),
                        Article.content.ilike(f"%{query}%"),
                    )
                )
            base_query = apply_operation_access_filter(
                query=base_query,
                ResourceClass=Article,
                current_user_db=user,
                session=None,
                operation=Operation.READ,
            )
            rows: list[Article] = base_query.order_by(Article.time_published.desc().nullslast()).limit(20).all()

        print_color("cyan", f"[MCP] search_articles: found {len(rows)} articles")
        return [
            {
                "id": str(a.id),
                "title": a.title,
                "slug": a.slug,
                "summary": a.summary,
                "kind": a.kind,
                "draft": a.draft,
                "tags": a.tags,
                "time_published": (a.time_published.isoformat() if a.time_published else None),
            }
            for a in rows
        ]
