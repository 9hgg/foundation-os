import os

os.environ.setdefault("SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:")
os.environ.setdefault("APP_SECRET", "test_app_secret")
os.environ.setdefault("SENDER_EMAIL", "sender@example.com")

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from pydantic import BaseModel

from libs.files.models import File
from libs.mcp.client_runtime import (
    ToolResultStore,
    extract_tool_runs_and_final_message,
    find_primary_list,
    infer_resource_href,
    normalize_collection,
    normalize_resource,
    parse_route_summary,
    render_collection_html,
    unwrap_endpoint_payload,
)
from libs.mcp.client_runtime.router import extract_json_payload

_REGISTER_FILE_PROFILE = File


def test_unwrap_endpoint_payload_and_find_primary_list():
    payload = {"error": None, "result": {"data": [{"id": "1", "title": "A"}]}, "message": None}

    assert unwrap_endpoint_payload(payload) == {"data": [{"id": "1", "title": "A"}]}
    assert find_primary_list(payload) == [{"id": "1", "title": "A"}]
    assert find_primary_list([{"id": "1"}]) == [{"id": "1"}]


def test_normalize_resource_uses_resource_profile_not_consumer_file_logic():
    route_index = parse_route_summary("- /host/dashboard/files : Files\n- /host/dashboard/files/:fileId : File detail")

    resource = normalize_resource(
        {
            "id": "abc",
            "public_filename": "demo.pdf",
            "content": "do not show",
            "kind": "document",
            "mime": "application/pdf",
            "size": 2048,
        },
        tool_name="list_file",
        route_index=route_index,
    )

    assert resource.title == "demo.pdf"
    assert resource.kind == "file"
    assert resource.href == "/host/dashboard/files/abc"
    assert resource.metadata["kind"] == "document"
    assert resource.metadata["mime"] == "application/pdf"
    assert "content" not in resource.metadata


def test_normalize_resource_reads_camel_case_profile_fields():
    resource = normalize_resource(
        {"id": "abc", "publicFilename": "demo-from-api.mp4", "sizeClient": 42, "kind": "video"},
        tool_name="list_file",
    )

    assert resource.title == "demo-from-api.mp4"
    assert resource.kind == "file"
    assert resource.metadata["size_client"] == 42
    assert resource.metadata["kind"] == "video"


def test_normalize_collection_and_render_html_escape_values():
    collection = normalize_collection(
        {
            "result": {
                "data": [
                    {"id": "1", "title": "<script>alert(1)</script>", "kind": "article"},
                    {"id": "2", "title": "Second", "kind": "article"},
                ],
                "totalCount": 2,
            }
        },
        tool_name="list_article",
    )

    assert collection is not None
    assert collection.total_count == 2
    html = render_collection_html(collection)
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "<script>" not in html
    assert 'class="list py-0"' in html


def test_route_summary_parsing_and_href_inference():
    route_index = parse_route_summary(
        """
        - /host/dashboard/teams : Team list.
        - /host/dashboard/teams/:teamId/builder : Team builder.
        """
    )

    assert infer_resource_href("team", "team-1", route_index) == "/host/dashboard/teams/team-1/builder"
    assert infer_resource_href("team", None, route_index) == "/host/dashboard/teams"


def test_normalize_resource_unwraps_single_resource_data_envelope_and_builds_href():
    route_index = parse_route_summary(
        """
        - /host/dashboard/codes/folder/:folderId : Folder detail.
        """
    )

    resource = normalize_resource(
        {
            "result": {
                "data": {
                    "id": "folder-123",
                    "name": "My first folder",
                }
            }
        },
        tool_name="get_folder",
        route_index=route_index,
    )

    assert resource.title == "My first folder"
    assert resource.kind == "folder"
    assert resource.href == "/host/dashboard/codes/folder/folder-123"


def test_tool_result_store_receipt_has_normalized_metadata():
    store = ToolResultStore()
    payload = {"data": [{"id": str(index), "name": f"Team {index}", "kind": "team"} for index in range(20)]}

    receipt = store.maybe_store("list_team", {}, payload)

    assert receipt["stored_tool_result"] is True
    assert receipt["normalized_count"] == 20
    assert receipt["detected_collection_kind"] == "team"
    assert receipt["detected_title"] == "Teams"
    assert store.get_payload(receipt["result_ref"]) == payload


def test_extract_tool_runs_separates_final_message():
    messages:list[BaseMessage] = [
        AIMessage(
            content="",
            tool_calls=[{"name": "list_file", "args": {}, "id": "call_1"}],
        ),
        ToolMessage(content='{"data": []}', tool_call_id="call_1"),
        AIMessage(content="Here is the final answer."),
    ]

    tool_runs, final_message = extract_tool_runs_and_final_message(messages)

    assert len(tool_runs) == 1
    assert tool_runs[0]["tool_name"] == "list_file"
    assert tool_runs[0]["status"] == "ok"
    assert final_message == "Here is the final answer."


def test_extract_json_payload_prefers_structured_content():
    class FakeToolResult(BaseModel):
        structuredContent: dict
        content: list = []

    result = FakeToolResult(structuredContent={"error": None, "result": {"data": [{"id": "1"}]}})

    assert extract_json_payload(result) == {"error": None, "result": {"data": [{"id": "1"}]}}
