"""
MCP tools for the files domain.

All file operations (list, get) are handled by the generic CRUD proxy via
``enlist_crud_operations_as_mcp_tools(mcp, File, backend_url, "/api/files", read=True)``.
No custom tools are needed — this module is intentionally empty.
"""
