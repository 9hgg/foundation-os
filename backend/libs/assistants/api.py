import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks

from libs.conversations.models import Conversation
from libs.db.methods import context_db
from libs.messages.models import Message
from libs.tasks.methods import launch_tasks_processing
from libs.tasks.models import Task
from libs.tasks.runtime_state import is_task_effectively_running, is_task_stale
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .config import ASSISTANTS_SETTINGS
from .models import AssistantProcessState, AssistantToolInfo, AssistantToolsResult

_ASSISTANT_TASK_KIND = "assistant"
_ASSISTANT_METHOD_NAME = "process_assistant_conversation"


def _build_custom_task_id(conversation_id: str) -> str:
    """Stable custom task ID for a conversation so only one task runs at a time."""
    return f"assistant-{conversation_id}"


def _derive_state_from_task(
    conversation_id: str,
    task: Task,
) -> AssistantProcessState:
    """Convert a Task record into an AssistantProcessState."""
    status = "idle"
    if is_task_effectively_running(task):
        status = "processing"
    elif task.completed and not task.failed:
        status = "done"
    elif task.failed:
        status = "failed"
    elif task.started and is_task_stale(task):
        status = "stalled"

    message_id: uuid.UUID | None = None
    if task.artifacts and isinstance(task.artifacts, dict):
        rv = task.artifacts.get("return_value")
        if isinstance(rv, dict) and rv.get("message_id"):
            try:
                message_id = uuid.UUID(rv["message_id"])
            except (ValueError, TypeError):
                pass

    return AssistantProcessState(
        conversation_id=uuid.UUID(conversation_id),
        task_id=task.id,
        status=status,
        message_id=message_id,
        progress=task.progress,
    )


def _get_or_create_task(conversation_id: str, user_id: str | None = None) -> Task:
    """
    Return the running task for this conversation, or create a new one.

    - If a task is actively running → return it (no duplicate).
    - Otherwise (completed, failed, stale, or absent) → create a fresh task.
      Completed tasks are always replaced: each new message needs a new run.
    """
    custom_id = _build_custom_task_id(conversation_id)

    with context_db() as db:
        existing_task: Task | None = (
            db.query(Task)
            .filter(Task.custom_id == custom_id)
            .order_by(Task.time_created.desc())  # type: ignore[attr-defined]
            .first()
        )

    if existing_task is not None:
        if is_task_effectively_running(existing_task):
            return existing_task

        # Completed, failed, or stale → rename so a new task can claim the same custom_id.
        # Completed tasks are always replaced: each new user message needs a fresh run.
        new_custom_id = f"{custom_id}-{uuid.uuid4().hex[:8]}"
        Task.patch(obj_id=existing_task.id, update_dict={"custom_id": new_custom_id})

    new_task = Task.create(
        obj_dict={
            "method_name": _ASSISTANT_METHOD_NAME,
            "custom_id": custom_id,
            "kind": _ASSISTANT_TASK_KIND,
            "title": f"Assistant process conversation {conversation_id}",
            "arguments": {
                "kwargs": {
                    "conversation_id": conversation_id,
                    "user_id": user_id,
                }
            },
        }
    )
    return new_task


def create_assistant_router(
    prefix: str = "/api/assistants",
    extra_tools: "list[AssistantToolInfo] | None" = None,
):
    assistant_router = APIRouter(prefix=prefix, tags=["assistants"])

    @assistant_router.post("/process/{conversation_id}")
    async def process_conversation(
        conversation_id: str,
        background_tasks: BackgroundTasks,
        classic_deps: ClassicDeps__dep,
    ) -> EndpointOutput[AssistantProcessState]:
        """
        Launch (or re-launch) AI processing for an assistance conversation.

        - If already being processed: returns the running task ID.
        - If stalled or errored: re-launches the task with the same messages.
        - If done: returns the result.
        - Otherwise: creates and queues a new task.
        """
        current_user_db, _, translator = classic_deps

        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate("You must be logged in."),
                    code="unauthorized",
                )
            )

        # ------------------------------------------------------------------
        # 1. Verify conversation exists
        # ------------------------------------------------------------------
        conversation_db = Conversation.by_id(conversation_id)
        if conversation_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title="Conversation not found",
                    description=f"Conversation {conversation_id} does not exist.",
                    code="conversation_not_found",
                )
            )

        # ------------------------------------------------------------------
        # 2. Verify that the conversation has messages
        # ------------------------------------------------------------------
        with context_db() as db:
            message_count = (
                db.query(Message)
                .filter(Message.conversation_id == conversation_db.id)
                .count()
            )

        if message_count == 0:
            return EndpointOutput(
                error=EndpointError(
                    title="Empty conversation",
                    description="The conversation has no messages to process.",
                    code="empty_conversation",
                )
            )

        # ------------------------------------------------------------------
        # 3. Get or create the assistant task
        # ------------------------------------------------------------------
        user_id = str(current_user_db.id) if current_user_db else None
        task = _get_or_create_task(conversation_id, user_id=user_id)
        state = _derive_state_from_task(conversation_id, task)

        # Trigger processing unless already actively running
        if state.status != "processing":
            background_tasks.add_task(launch_tasks_processing)

        return EndpointOutput(result=state)

    @assistant_router.get("/process/{conversation_id}/state")
    async def get_conversation_state(
        conversation_id: str,
        classic_deps: ClassicDeps__dep,
    ) -> EndpointOutput[AssistantProcessState]:
        """Return the current processing state for a conversation."""
        current_user_db, _, translator = classic_deps

        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate("You must be logged in."),
                    code="unauthorized",
                )
            )

        custom_id = _build_custom_task_id(conversation_id)
        with context_db() as db:
            task: Task | None = (
                db.query(Task)
                .filter(Task.custom_id == custom_id)
                .order_by(Task.time_created.desc())  # type: ignore[attr-defined]
                .first()
            )

        if task is None:
            return EndpointOutput(
                result=AssistantProcessState(
                    conversation_id=uuid.UUID(conversation_id),
                    status="idle",
                )
            )

        return EndpointOutput(result=_derive_state_from_task(conversation_id, task))

    @assistant_router.get("/tools")
    async def list_assistant_tools(
        classic_deps: ClassicDeps__dep,
    ) -> EndpointOutput[AssistantToolsResult]:
        """List all tools available to the assistant background task.

        Returns three categories of tools:
        - **harness** – built-in in-process tools always available (read/write
          artifacts, create evidence, list/aggregate collections, etc.).
        - **mcp** – tools exposed by the configured MCP server
          (``ASSISTANT_MCP_SERVER_URL``).  Omitted when not configured or
          temporarily unreachable.
        - **app** – tools explicitly declared by the calling app via the
          ``extra_tools`` parameter of ``create_assistant_router()``.
        """
        current_user_db, _, translator = classic_deps

        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate("You must be logged in."),
                    code="unauthorized",
                )
            )

        tools: list[AssistantToolInfo] = []

        # ----------------------------------------------------------------
        # 1. Bob store tools (always available, in-process)
        # ----------------------------------------------------------------
        try:
            from libs.bob.tools import ToolRegistry, build_store_tools

            artifact_registry = ToolRegistry()
            build_store_tools(artifact_registry)
            for bob_tool in artifact_registry.as_list():
                description = bob_tool.description or ""
                short_desc = description.strip().split("\n\n", 1)[0].strip() or None
                tools.append(
                    AssistantToolInfo(
                        name=bob_tool.name,
                        description=description,
                        short_description=short_desc,
                        source="harness",
                    )
                )
        except Exception:
            pass

        # ----------------------------------------------------------------
        # 2. MCP tools (optional, per-app configuration)
        # ----------------------------------------------------------------
        mcp_server_url = ASSISTANTS_SETTINGS.ASSISTANT_MCP_SERVER_URL.strip()
        if mcp_server_url:
            try:
                from mcp import ClientSession
                from mcp.client.sse import sse_client

                async with (
                    sse_client(mcp_server_url) as (read, write),
                    ClientSession(read, write) as session,
                ):
                    await session.initialize()
                    result = await session.list_tools()
                    for mcp_tool in result.tools:
                        tool_name = mcp_tool.name
                        tool_description = mcp_tool.description or ""
                        input_schema: dict[str, Any] | None = mcp_tool.inputSchema
                        short_desc = tool_description.strip().split("\n\n", 1)[0].strip() or None
                        tools.append(
                            AssistantToolInfo(
                                name=tool_name,
                                description=tool_description,
                                short_description=short_desc,
                                input_schema=input_schema,
                                source="mcp",
                            )
                        )
            except Exception:
                pass

        # ----------------------------------------------------------------
        # 3. App-specific tools declared by the calling app
        # ----------------------------------------------------------------
        if extra_tools:
            tools.extend(extra_tools)

        return EndpointOutput(result=AssistantToolsResult(tools=tools))

    return assistant_router
