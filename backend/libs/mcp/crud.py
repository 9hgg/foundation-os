"""
Generic CRUD-to-MCP bridge.

Provides ``enlist_crud_operations_as_mcp_tools`` which registers FastMCP tools
that proxy the standard CRUD REST endpoints of any Resource via httpx.

Usage::

    from libs.mcp.crud import enlist_crud_operations_as_mcp_tools
    from libs.teams.models import Team

    enlist_crud_operations_as_mcp_tools(
        mcp,
        Team,
        backend_url="http://localhost:8003",
        api_prefix="/api/teams",
        read=True,
        create=True,
        delete=False,
    )

This registers ``list_team``, ``get_team``, and ``create_team`` on the FastMCP
instance.  Tool docstrings are derived from the model fields and include the
filter / pagination syntax supported by ``create_crud_endpoints``.
"""

import textwrap
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

from libs.endpoints.types import PaginatedResponse, SimpleResponse
from libs.logger.customLogger import print_color
from libs.mcp.resource_filter import build_field_filter_class, filters_to_strings
from libs.resource import Resource
from libs.utils.types import EndpointError, EndpointOutput



def _field_summary(ResourceClass: type[Resource]) -> str:
    """Return a bullet list of the model fields for use in tool docstrings."""
    try:
        fields = ResourceClass.model_fields
    except AttributeError:
        return "(field info unavailable)"
    lines: list[str] = []
    for name, info in fields.items():
        ann = info.annotation
        type_name = getattr(ann, "__name__", str(ann))
        desc = info.description or ""
        line = f"  - ``{name}`` ({type_name})"
        if desc:
            line += f": {desc}"
        lines.append(line)
    return "\n".join(lines) if lines else "(no fields)"


def enlist_crud_operations_as_mcp_tools(
    mcp: FastMCP,
    ResourceClass: type[Resource],
    backend_url: str,
    api_prefix: str,
    *,
    read: bool = True,
    create: bool = False,
    update: bool = False,
    patch: bool = False,
    delete: bool = False,
) -> None:
    """
    Register FastMCP tools that proxy the CRUD REST endpoints of *ResourceClass*.

    Each enabled operation becomes a callable MCP tool that calls the corresponding
    endpoint on *backend_url* + *api_prefix* via httpx, forwarding the caller's
    ``auth_token`` as a ``Bearer`` header.  ACL filtering is handled server-side by
    the REST layer — no direct DB access happens here.

    Args:
        mcp:           FastMCP server instance to register tools on.
        ResourceClass: The Resource subclass whose endpoints to expose (e.g. ``Team``).
        backend_url:   Base URL of the backend server (e.g. ``"http://localhost:8003"``).
        api_prefix:    URL prefix for this resource's CRUD router (e.g. ``"/api/teams"``).
        read:          Expose ``list_{kind}`` (paginated list) and ``get_{kind}`` (by ID).
        create:        Expose ``create_{kind}`` (POST).
        update:        Expose ``update_{kind}`` (PUT — full replacement).
        patch:         Expose ``patch_{kind}`` (PATCH — partial update).
        delete:        Expose ``delete_{kind}`` (DELETE).
    """
    kind = ResourceClass.__kind__
    base = backend_url.rstrip("/") + "/" + api_prefix.lstrip("/")
    fields_doc = _field_summary(ResourceClass)
    PaginatedEnvelope = EndpointOutput[PaginatedResponse[ResourceClass]]
    SimpleEnvelope = EndpointOutput[SimpleResponse[ResourceClass]]

    # ------------------------------------------------------------------
    # READ — list (paginated) + get by ID
    # ------------------------------------------------------------------
    if read:
        # Build a typed FieldFilter class whose `field` attribute is constrained
        # to the actual field names on this resource.  The LLM sees an enum in
        # the JSON schema instead of a free-form string, preventing mis-typed
        # field names and wrong filter formats.
        FieldFilter = build_field_filter_class(ResourceClass, kind)

        _list_doc = textwrap.dedent(f"""
            List {kind} resources with pagination and typed filters.

            Results are ACL-filtered: only resources the caller has READ access to are
            returned.  Pass *auth_token* (from the ``login`` tool) to include resources
            owned or shared with the authenticated user.

            Each entry in *filters* is a structured object with:
              - ``field``: one of the available field names below (enum-constrained).
              - ``value``: the value to match (null, true/false, string or number).
              - ``match_type``: ``"exact"`` (default) or ``"partial"`` (substring).
              - ``comparison``: optional operator for numeric/datetime fields:
                ``"<"``, ``">"``, ``"<="`` , ``">="`` , ``"<>"``.

            Available fields on ``{ResourceClass.__name__}``:
            {fields_doc}

            Filters within a single call are combined with AND logic.
            To express OR across different fields, call this tool multiple times
            (once per candidate field) and deduplicate the results by ``id``.

            If the user asks for a property not represented by any field above, list
            resources without filters and analyse the returned data.

            Success / retry guidance:
            - SUCCESS: the response contains at least one item (``result.data`` is non-empty).
            - RETRY if empty: the filter may be too strict — broaden it (switch
              ``match_type`` from ``"exact"`` to ``"partial"``, try a different
              candidate field, or remove the filter entirely to list all visible items).

            Cookbook:
            - To fetch the single largest/smallest item by a numeric field, use page_size=1
              with ordering_by="<field>:desc" (or ":asc"). Any field listed above can be used.
            - To fetch the most recent item: ordering_by="time_created:desc", page_size=1.
            - To count all items without loading them: read result.totalCount after any call.
            - Full example — most recent, filtered by kind:
              {{"page": 1, "page_size": 1, "filters": [{{"field": "kind", "value": "video", "match_type": "exact"}}], "ordering_by": "time_created:desc"}}

            Args:
                page: Page number (1-based, default 1).
                page_size: Items per page (default 100, max 1000).
                filters: Typed filter objects — field name, value, match_type, comparison.
                ordering_by: Ordering expression — any available field name followed by ``:asc`` or ``:desc``.
                auth_token: Optional JWT bearer token for authenticated access.
        """).strip()

        async def _list(
            page: int = 1,
            page_size: int = 100,
            filters: list[FieldFilter] | None = None,  # type: ignore[valid-type]
            ordering_by: str | None = None,
            auth_token: str | None = None,
        ) -> PaginatedEnvelope:
            filter_strings = filters_to_strings(filters)
            print_color("cyan", f"[MCP:CRUD] list_{kind}: page={page} page_size={page_size} filters={filter_strings!r} ordering_by={ordering_by!r} auth={bool(auth_token)}")
            params: dict[str, Any] = {"page": page, "page_size": page_size}
            if filter_strings:
                params["filters"] = filter_strings
            if ordering_by:
                params["ordering_by"] = ordering_by
            headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
            async with httpx.AsyncClient() as client:
                resp = await client.get(base, params=params, headers=headers)
                print_color("cyan", f"[MCP:CRUD] list_{kind}: HTTP {resp.status_code}")
                resp.raise_for_status()
            data_json = resp.json()

            data_json_result = data_json.get("result") or {}
            data_json_error = data_json.get("error",None)
            print_color("cyan", f"[MCP:CRUD] list_{kind}: response JSON received, parsing result... result={data_json_result} error={data_json_error}")

            # try to parse the error as EndpointError, and the result as list[ResourceClass]
            if data_json_error:
                error = EndpointError(**data_json_error) if isinstance(data_json_error, dict) else None
                error_title = error.title if error else None
                error_description = error.description if error else None
                error_code = error.code if error else None
                error_details = error.details if error else None
                print_color("yellow", f"[MCP:CRUD] list_{kind}: error={error_title} description={error_description} code={error_code} details={error_details}")

            if data_json_result:
                items = data_json_result.get("data", [])
                print_color("cyan", f"[MCP:CRUD] list_{kind}: result contains {len(items)} items")

            return data_json  # type: ignore[return-value]

        _list.__doc__ = _list_doc
        _list.__name__ = f"list_{kind}s"
        mcp.tool(name=f"list_{kind}s")(_list)

        _get_doc = textwrap.dedent(f"""
            Retrieve the full payload of a single {kind} resource by its UUID; use this when you already know the exact ID.

            Returns the complete resource object if the caller has READ access.  If
            you do not yet have the UUID, call ``list_{kind}s`` first to search or
            paginate through available {kind} resources.

            When to use this vs alternatives:
            - Use ``get_{kind}`` when you have the exact UUID and want the full record.
            - Use ``list_{kind}s`` when you need to search by field value or enumerate
              {kind} resources to obtain their IDs.

            Success / retry guidance:
            - SUCCESS: the response contains ``result.data`` with the resource fields
              (non-null, no ``error`` key).
            - RETRY if "Invalid resource ID" error: the value passed as ``resource_id``
              is not a valid UUID.  If you obtained it from a natural-language query
              (e.g. a name or reference string), call ``list_{kind}s`` with a filter
              first to retrieve the actual UUID, then call ``get_{kind}`` with that UUID.
            - RETRY if "Item not found": the resource does not exist or is not
              accessible; verify the UUID and auth token, or search via ``list_{kind}s``.

            Args:
                resource_id: UUID of the {kind} to retrieve,
                             e.g. ``"3fa85f64-5717-4562-b3fc-2c963f66afa6"``.
                auth_token: Optional JWT bearer token from ``login``.  Required for
                            non-public resources.

            Returns:
                The standard API envelope:
                ``{{"result": {{"data": {{...{kind} fields...}}}}, "error": null}}``
                or an error envelope when the resource is not found or not accessible.

            Example prompts:
            - "Get {kind} 3fa85f64-5717-4562-b3fc-2c963f66afa6."
            - "Show me the details of this {kind}."
        """).strip()

        async def _get(resource_id: str, auth_token: str | None = None) -> SimpleEnvelope:
            print_color("cyan", f"[MCP:CRUD] get_{kind}: resource_id={resource_id!r} auth={bool(auth_token)}")
            headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
            async with httpx.AsyncClient() as client:
                resp = await client.get(f"{base}/{resource_id}", headers=headers)
                print_color("cyan", f"[MCP:CRUD] get_{kind}: HTTP {resp.status_code}")
                resp.raise_for_status()
            data = resp.json()
            if err := (data.get("error") if isinstance(data, dict) else None):
                print_color("yellow", f"[MCP:CRUD] get_{kind}: error={err}")
            else:
                resource_id_result = ((data.get("result") or {}).get("data") or {}).get("id")
                print_color("cyan", f"[MCP:CRUD] get_{kind}: found id={resource_id_result!r}")
            return data  # type: ignore[return-value]

        _get.__doc__ = _get_doc
        _get.__name__ = f"get_{kind}"
        mcp.tool(name=f"get_{kind}")(_get)

    # ------------------------------------------------------------------
    # CREATE
    # ------------------------------------------------------------------
    if create:
        _create_doc = textwrap.dedent(f"""
            Create a new {kind} resource.  Requires authentication.

            The resource is owned by the authenticated user and receives default
            read/write/delete ACLs for that user.

            Available fields on ``{ResourceClass.__name__}``:
            {fields_doc}

            Args:
                data: Dictionary of {kind} field values to set.
                auth_token: JWT bearer token of the authenticated user (required).
        """).strip()

        async def _create(data: dict[str, Any], auth_token: str) -> SimpleEnvelope:
            print_color("cyan", f"[MCP:CRUD] create_{kind}: data_keys={list(data.keys())} auth={bool(auth_token)}")
            headers = {"Authorization": f"Bearer {auth_token}"}
            async with httpx.AsyncClient() as client:
                resp = await client.post(base, json=data, headers=headers)
                print_color("cyan", f"[MCP:CRUD] create_{kind}: HTTP {resp.status_code}")
                resp.raise_for_status()
            result = resp.json()
            if err := (result.get("error") if isinstance(result, dict) else None):
                print_color("yellow", f"[MCP:CRUD] create_{kind}: error={err}")
            else:
                new_id = ((result.get("result") or {}).get("data") or {}).get("id")
                print_color("cyan", f"[MCP:CRUD] create_{kind}: created id={new_id!r}")
            return result  # type: ignore[return-value]

        _create.__doc__ = _create_doc
        _create.__name__ = f"create_{kind}"
        mcp.tool(name=f"create_{kind}")(_create)

    # ------------------------------------------------------------------
    # PATCH (partial update)
    # ------------------------------------------------------------------
    if patch:
        _patch_doc = textwrap.dedent(f"""
            Partially update a {kind} resource (PATCH — only supplied fields change).

            Requires authentication and WRITE access to the resource.

            Available fields on ``{ResourceClass.__name__}``:
            {fields_doc}

            Args:
                resource_id: UUID of the {kind} to update.
                data: Dictionary of fields to update (only these fields change).
                auth_token: JWT bearer token of the authenticated user (required).
        """).strip()

        async def _patch(resource_id: str, data: dict[str, Any], auth_token: str) -> SimpleEnvelope:
            print_color("cyan", f"[MCP:CRUD] patch_{kind}: resource_id={resource_id!r} data_keys={list(data.keys())} auth={bool(auth_token)}")
            headers = {"Authorization": f"Bearer {auth_token}"}
            async with httpx.AsyncClient() as client:
                resp = await client.patch(f"{base}/{resource_id}", json=data, headers=headers)
                print_color("cyan", f"[MCP:CRUD] patch_{kind}: HTTP {resp.status_code}")
                resp.raise_for_status()
            result = resp.json()
            if err := (result.get("error") if isinstance(result, dict) else None):
                print_color("yellow", f"[MCP:CRUD] patch_{kind}: error={err}")
            else:
                print_color("cyan", f"[MCP:CRUD] patch_{kind}: ok")
            return result  # type: ignore[return-value]

        _patch.__doc__ = _patch_doc
        _patch.__name__ = f"patch_{kind}"
        mcp.tool(name=f"patch_{kind}")(_patch)

    # ------------------------------------------------------------------
    # UPDATE / PUT (full replacement)
    # ------------------------------------------------------------------
    if update:
        _update_doc = textwrap.dedent(f"""
            Fully replace a {kind} resource (PUT — all fields must be provided).

            Omitted fields are reset to their model defaults or None.  Requires
            authentication and WRITE access to the resource.

            Available fields on ``{ResourceClass.__name__}``:
            {fields_doc}

            Args:
                resource_id: UUID of the {kind} to replace.
                data: Complete resource payload as a dictionary.
                auth_token: JWT bearer token of the authenticated user (required).
        """).strip()

        async def _update(resource_id: str, data: dict[str, Any], auth_token: str) -> SimpleEnvelope:
            print_color("cyan", f"[MCP:CRUD] update_{kind}: resource_id={resource_id!r} data_keys={list(data.keys())} auth={bool(auth_token)}")
            headers = {"Authorization": f"Bearer {auth_token}"}
            async with httpx.AsyncClient() as client:
                resp = await client.put(f"{base}/{resource_id}", json=data, headers=headers)
                print_color("cyan", f"[MCP:CRUD] update_{kind}: HTTP {resp.status_code}")
                resp.raise_for_status()
            result = resp.json()
            if err := (result.get("error") if isinstance(result, dict) else None):
                print_color("yellow", f"[MCP:CRUD] update_{kind}: error={err}")
            else:
                print_color("cyan", f"[MCP:CRUD] update_{kind}: ok")
            return result  # type: ignore[return-value]

        _update.__doc__ = _update_doc
        _update.__name__ = f"update_{kind}"
        mcp.tool(name=f"update_{kind}")(_update)

    # ------------------------------------------------------------------
    # DELETE
    # ------------------------------------------------------------------
    if delete:
        _delete_doc = textwrap.dedent(f"""
            Delete a {kind} resource.  Requires authentication and DELETE access.

            Args:
                resource_id: UUID of the {kind} to delete.
                auth_token: JWT bearer token of the authenticated user (required).
        """).strip()

        async def _delete(resource_id: str, auth_token: str) -> SimpleEnvelope:
            print_color("cyan", f"[MCP:CRUD] delete_{kind}: resource_id={resource_id!r} auth={bool(auth_token)}")
            headers = {"Authorization": f"Bearer {auth_token}"}
            async with httpx.AsyncClient() as client:
                resp = await client.delete(f"{base}/{resource_id}", headers=headers)
                print_color("cyan", f"[MCP:CRUD] delete_{kind}: HTTP {resp.status_code}")
                resp.raise_for_status()
            result = resp.json()
            if err := (result.get("error") if isinstance(result, dict) else None):
                print_color("yellow", f"[MCP:CRUD] delete_{kind}: error={err}")
            else:
                print_color("cyan", f"[MCP:CRUD] delete_{kind}: ok")
            return result  # type: ignore[return-value]

        _delete.__doc__ = _delete_doc
        _delete.__name__ = f"delete_{kind}"
        mcp.tool(name=f"delete_{kind}")(_delete)


# ---------------------------------------------------------------------------
# Merged variant — one tool per operation, kind-dispatched
# ---------------------------------------------------------------------------


def enlist_crud_operations_as_mcp_tools_merged(
    mcp: FastMCP,
    resources: list[dict[str, Any]],
    backend_url: str,
) -> None:
    """
    Register ONE MCP tool per CRUD operation (list, get, create, patch, update,
    delete) that dispatches over multiple resources via a ``kind`` argument.

    This is the compact counterpart of :func:`enlist_crud_operations_as_mcp_tools`:
    instead of N tools per resource x K resources = N*K tools, we get N tools
    that each accept a ``kind`` enum of all configured resources. The LLM picks
    the kind at call time. This drastically cuts the prompt's tool-description
    bytes when many resources are exposed read-only.

    Args:
        mcp: FastMCP server instance.
        resources: list of dicts, one per resource to expose. Each dict accepts:
            - ``resource_class`` (required): Resource subclass (e.g. ``Team``).
            - ``api_prefix`` (required): URL prefix (e.g. ``"/api/teams"``).
            - ``read``, ``create``, ``update``, ``patch``, ``delete``: bool flags
              (defaults: ``read=True``, others ``False``). A tool for a given
              operation is registered iff at least one resource opts in.
        backend_url: backend base URL (e.g. ``"http://localhost:8000"``).

    Field-level filter enums are NOT applied here (would require dependent
    enums on ``field`` once ``kind`` is set). The LLM passes ``field`` as a
    plain string; the per-kind available fields are listed in the tool's
    docstring.
    """
    if not resources:
        raise ValueError("enlist_crud_operations_as_mcp_tools_merged: empty resources")  # noqa: TRY003

    # Normalise + index by kind.
    base_root = backend_url.rstrip("/")
    config_by_kind: dict[str, dict[str, Any]] = {}
    for entry in resources:
        ResourceClass = entry["resource_class"]
        api_prefix = entry["api_prefix"]
        kind = ResourceClass.__kind__
        if kind in config_by_kind:
            raise ValueError(  # noqa: TRY003
                f"enlist_crud_operations_as_mcp_tools_merged: duplicate kind {kind!r}"
            )
        config_by_kind[kind] = {
            "ResourceClass": ResourceClass,
            "base": f"{base_root}/{api_prefix.lstrip('/')}",
            "op_flags": {
                "read": entry.get("read", True),
                "create": entry.get("create", False),
                "update": entry.get("update", False),
                "patch": entry.get("patch", False),
                "delete": entry.get("delete", False),
            },
        }

    fields_summary = _build_fields_summary(config_by_kind)
    has_op = {
        op: any(config["op_flags"][op] for config in config_by_kind.values())
        for op in ("read", "create", "update", "patch", "delete")
    }

    if has_op["read"]:
        _register_merged_list(mcp, config_by_kind, fields_summary)
        _register_merged_get(mcp, config_by_kind)
    if has_op["create"]:
        _register_merged_create(mcp, config_by_kind)
    if has_op["patch"]:
        _register_merged_patch(mcp, config_by_kind)
    if has_op["update"]:
        _register_merged_update(mcp, config_by_kind)
    if has_op["delete"]:
        _register_merged_delete(mcp, config_by_kind)


# ---------------------------------------------------------------------------
# Merged-variant internals
# ---------------------------------------------------------------------------


def _indent_block(text: str, prefix: str) -> str:
    return "\n".join(prefix + line if line.strip() else line for line in text.splitlines())


def _build_fields_summary(config_by_kind: dict[str, dict[str, Any]]) -> str:
    blocks: list[str] = []
    for kind in sorted(config_by_kind):
        ResourceClass = config_by_kind[kind]["ResourceClass"]
        blocks.append(
            f"- ``{kind}`` ({ResourceClass.__name__}):\n"
            f"{_indent_block(_field_summary(ResourceClass), '  ')}"
        )
    return "\n".join(blocks)


def _kinds_enabled_for(config_by_kind: dict[str, dict[str, Any]], op: str) -> list[str]:
    return sorted(k for k, config in config_by_kind.items() if config["op_flags"][op])


def _config_for_op(config_by_kind: dict[str, dict[str, Any]], kind: str, op: str) -> dict[str, Any]:
    if kind not in config_by_kind:
        available = ", ".join(sorted(config_by_kind))
        raise ValueError(  # noqa: TRY003
            f"unknown kind {kind!r}; available: {available}"
        )
    config = config_by_kind[kind]
    if not config["op_flags"].get(op, False):
        raise ValueError(  # noqa: TRY003
            f"operation {op!r} is not enabled for kind {kind!r}"
        )
    return config


def _register_merged_list(
    mcp: FastMCP,
    config_by_kind: dict[str, dict[str, Any]],
    fields_summary: str,
) -> None:
    kinds = _kinds_enabled_for(config_by_kind, "read")
    doc = textwrap.dedent(f"""
        List resources of any registered kind with pagination + filters.

        Pass ``kind`` to select which resource type to query — must be one of:
        {', '.join(repr(k) for k in kinds)}.

        Filters are an optional list of dicts with the same shape as the
        non-merged ``list_<kind>`` tools:
          - ``field``: name of the field to filter on (see fields per kind below).
          - ``value``: value to match (null, true/false, string or number).
          - ``match_type``: ``"exact"`` (default) or ``"partial"``.
          - ``comparison``: ``"<"`` | ``">"`` | ``"<="`` | ``">="`` | ``"<>"``.
        Multiple filters within the same call are combined with AND logic.

        Available fields per kind:
        {fields_summary}

        Ordering: ``ordering_by`` is ``"<field>:asc"`` or ``"<field>:desc"``.
        For the most recent item: ``ordering_by="time_created:desc"``, ``page_size=1``.
    """).strip()

    async def _list_resource(
        kind: str,
        page: int = 1,
        page_size: int = 100,
        filters: list[dict[str, Any]] | None = None,
        ordering_by: str | None = None,
        auth_token: str | None = None,
    ) -> dict[str, Any]:
        config = _config_for_op(config_by_kind, kind, "read")
        filter_strings = filters_to_strings(filters)
        print_color("cyan", f"[MCP:CRUD] list_resource[{kind}]: page={page} page_size={page_size} filters={filter_strings!r} ordering_by={ordering_by!r} auth={bool(auth_token)}")
        params: dict[str, Any] = {"page": page, "page_size": page_size}
        if filter_strings:
            params["filters"] = filter_strings
        if ordering_by:
            params["ordering_by"] = ordering_by
        headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
        async with httpx.AsyncClient() as client:
            resp = await client.get(config["base"], params=params, headers=headers)
            print_color("cyan", f"[MCP:CRUD] list_resource[{kind}]: HTTP {resp.status_code}")
            resp.raise_for_status()
        return resp.json()

    _list_resource.__doc__ = doc
    _list_resource.__name__ = "list_resource"
    mcp.tool(name="list_resource")(_list_resource)


def _register_merged_get(mcp: FastMCP, config_by_kind: dict[str, dict[str, Any]]) -> None:
    kinds = _kinds_enabled_for(config_by_kind, "read")
    doc = textwrap.dedent(f"""
        Retrieve a single resource of any registered kind by its UUID.

        Pass ``kind`` to select the resource type — must be one of:
        {', '.join(repr(k) for k in kinds)}.

        If you do not yet have the UUID, call ``list_resource`` first.

        Args:
            kind: resource kind enum.
            resource_id: UUID of the resource to retrieve.
            auth_token: bearer token from the ``login`` tool; pass it for authenticated reads.
    """).strip()

    async def _get_resource(kind: str, resource_id: str, auth_token: str | None = None) -> dict[str, Any]:
        config = _config_for_op(config_by_kind, kind, "read")
        print_color("cyan", f"[MCP:CRUD] get_resource[{kind}]: resource_id={resource_id!r} auth={bool(auth_token)}")
        headers = {"Authorization": f"Bearer {auth_token}"} if auth_token else {}
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{config['base']}/{resource_id}", headers=headers)
            print_color("cyan", f"[MCP:CRUD] get_resource[{kind}]: HTTP {resp.status_code}")
            resp.raise_for_status()
        return resp.json()

    _get_resource.__doc__ = doc
    _get_resource.__name__ = "get_resource"
    mcp.tool(name="get_resource")(_get_resource)


def _register_merged_create(mcp: FastMCP, config_by_kind: dict[str, dict[str, Any]]) -> None:
    kinds = _kinds_enabled_for(config_by_kind, "create")
    doc = textwrap.dedent(f"""
        Create a new resource of the given kind. Requires authentication.

        ``kind`` must be one of:
        {', '.join(repr(k) for k in kinds)}.

        Available fields per kind (see ``list_resource`` doc for the full list).
    """).strip()

    async def _create_resource(kind: str, data: dict[str, Any], auth_token: str) -> dict[str, Any]:
        config = _config_for_op(config_by_kind, kind, "create")
        print_color("cyan", f"[MCP:CRUD] create_resource[{kind}]: data_keys={list(data.keys())} auth={bool(auth_token)}")
        headers = {"Authorization": f"Bearer {auth_token}"}
        async with httpx.AsyncClient() as client:
            resp = await client.post(config["base"], json=data, headers=headers)
            print_color("cyan", f"[MCP:CRUD] create_resource[{kind}]: HTTP {resp.status_code}")
            resp.raise_for_status()
        return resp.json()

    _create_resource.__doc__ = doc
    _create_resource.__name__ = "create_resource"
    mcp.tool(name="create_resource")(_create_resource)


def _register_merged_patch(mcp: FastMCP, config_by_kind: dict[str, dict[str, Any]]) -> None:
    kinds = _kinds_enabled_for(config_by_kind, "patch")
    doc = textwrap.dedent(f"""
        Partially update a resource (only supplied fields change).

        ``kind`` must be one of:
        {', '.join(repr(k) for k in kinds)}.
    """).strip()

    async def _patch_resource(kind: str, resource_id: str, data: dict[str, Any], auth_token: str) -> dict[str, Any]:
        config = _config_for_op(config_by_kind, kind, "patch")
        print_color("cyan", f"[MCP:CRUD] patch_resource[{kind}]: resource_id={resource_id!r} data_keys={list(data.keys())} auth={bool(auth_token)}")
        headers = {"Authorization": f"Bearer {auth_token}"}
        async with httpx.AsyncClient() as client:
            resp = await client.patch(f"{config['base']}/{resource_id}", json=data, headers=headers)
            print_color("cyan", f"[MCP:CRUD] patch_resource[{kind}]: HTTP {resp.status_code}")
            resp.raise_for_status()
        return resp.json()

    _patch_resource.__doc__ = doc
    _patch_resource.__name__ = "patch_resource"
    mcp.tool(name="patch_resource")(_patch_resource)


def _register_merged_update(mcp: FastMCP, config_by_kind: dict[str, dict[str, Any]]) -> None:
    kinds = _kinds_enabled_for(config_by_kind, "update")
    doc = textwrap.dedent(f"""
        Fully replace a resource (all fields must be provided).

        ``kind`` must be one of:
        {', '.join(repr(k) for k in kinds)}.
    """).strip()

    async def _update_resource(kind: str, resource_id: str, data: dict[str, Any], auth_token: str) -> dict[str, Any]:
        config = _config_for_op(config_by_kind, kind, "update")
        print_color("cyan", f"[MCP:CRUD] update_resource[{kind}]: resource_id={resource_id!r} data_keys={list(data.keys())} auth={bool(auth_token)}")
        headers = {"Authorization": f"Bearer {auth_token}"}
        async with httpx.AsyncClient() as client:
            resp = await client.put(f"{config['base']}/{resource_id}", json=data, headers=headers)
            print_color("cyan", f"[MCP:CRUD] update_resource[{kind}]: HTTP {resp.status_code}")
            resp.raise_for_status()
        return resp.json()

    _update_resource.__doc__ = doc
    _update_resource.__name__ = "update_resource"
    mcp.tool(name="update_resource")(_update_resource)


def _register_merged_delete(mcp: FastMCP, config_by_kind: dict[str, dict[str, Any]]) -> None:
    kinds = _kinds_enabled_for(config_by_kind, "delete")
    doc = textwrap.dedent(f"""
        Delete a resource.

        ``kind`` must be one of:
        {', '.join(repr(k) for k in kinds)}.
    """).strip()

    async def _delete_resource(kind: str, resource_id: str, auth_token: str) -> dict[str, Any]:
        config = _config_for_op(config_by_kind, kind, "delete")
        print_color("cyan", f"[MCP:CRUD] delete_resource[{kind}]: resource_id={resource_id!r} auth={bool(auth_token)}")
        headers = {"Authorization": f"Bearer {auth_token}"}
        async with httpx.AsyncClient() as client:
            resp = await client.delete(f"{config['base']}/{resource_id}", headers=headers)
            print_color("cyan", f"[MCP:CRUD] delete_resource[{kind}]: HTTP {resp.status_code}")
            resp.raise_for_status()
        return resp.json()

    _delete_resource.__doc__ = doc
    _delete_resource.__name__ = "delete_resource"
    mcp.tool(name="delete_resource")(_delete_resource)
