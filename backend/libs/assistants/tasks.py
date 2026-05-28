"""Background task that generates an AI reply for a stored conversation using Bob."""

from dataclasses import dataclass
from tempfile import mkdtemp, mktemp
from uuid import UUID

from libs.bob.bob.bob import BobRuntime
from libs.bob.bob.shell import run_bob_shell_turn
from libs.bob.conversation.conversation_participant import ConversationAgent
from libs.bob.history.history import History, HistoryEntryKind
from libs.bob.tools import (
    build_plan_tools,
    build_report_tools,
    build_store_tools,
)
from libs.conversations.models import Conversation
from libs.db import context_db
from libs.logger.customLogger import print_color
from libs.messages.models import Message
from libs.ml.llm import LLMClient
from libs.tasks.models import Task
from libs.tasks.tasks_manager import TasksManager
from libs.users.methods import _get_user_display_info
from libs.users.models import User

from .config import ASSISTANTS_SETTINGS
from .constants import _AI_RESPONSE_KIND, _THINKING_KIND
from .methods.users import _resolve_auth_token
from .methods.utils import _set_task_progress

_FALLBACK_REPLY = (
    "I was unable to generate a response for this request. "
    "Please try again or rephrase your question."
)


def format_bob_thinking(history: History) -> str:
    """Convert Bob History entries into a markdown thinking block."""
    lines = ["**Assistant reasoning steps:**\n"]
    for entry in history.entries:
        if entry.kind == HistoryEntryKind.tool:
            icon = "✅" if not entry.error else "❌"
            args_str = str(entry.arguments or {})[:200]
            lines.append(f"- {icon} **{entry.tool_name}**({args_str})")
            if entry.observation:
                lines.append(f"  → {entry.observation[:400]}")
            if entry.result_structure:
                lines.append(f"  structure: {entry.result_structure[:200]}")
            if entry.output_paths:
                lines.append(f"  saved_to: {', '.join(entry.output_paths)}")
            if entry.duration_ms is not None:
                lines.append(f"  ⏱ {entry.duration_ms:.0f}ms")
            if entry.error:
                lines.append(f"  ❌ {entry.error}")
        else:
            name = entry.name or ""
            description = entry.description or ""
            if name or description:
                text = f"**{name}**" if name else ""
                if description:
                    text = f"{text}: {description[:300]}" if text else description[:300]
                lines.append(f"- 📝 {text}")
    return "\n".join(lines)


def _resolve_assistant_mcp_server_url() -> str:
    from libs.mcp.config import MCP_SETTINGS

    configured = ASSISTANTS_SETTINGS.ASSISTANT_MCP_SERVER_URL.strip()
    if configured:
        return configured
    for server in MCP_SETTINGS.MCP_SERVER_LIST:
        url = server.get("url")
        if isinstance(url, str) and url.strip():
            return url.strip()
    return ""


@dataclass(frozen=True)
class UserDetails:
    id: UUID
    user: User
    display_name: str


user_details_cache: dict[UUID, UserDetails | None] = {}


def _get_user_details(user_id: UUID | None) -> UserDetails | None:
    global user_details_cache
    if user_id is None:
        return None
    if user_id in user_details_cache:
        return user_details_cache[user_id]
    user = User.by_id(user_id)
    if user is None:
        user_details_cache[user_id] = None
        return None
    display_name, _ = _get_user_display_info(user_id)
    details = UserDetails(id=user_id, user=user, display_name=display_name)
    user_details_cache[user_id] = details
    return details


def _build_current_user_prompt_block(user_details: UserDetails | None) -> str:
    """Build the directive 'CURRENT USER' block appended to the behavior prompt.

    Phrased as instructions (not facts) so the model actually applies the
    addressing/language rules; ambient facts at the end of a long prompt are
    routinely ignored.
    """
    if user_details is None:
        return (
            "CURRENT USER: anonymous / unresolved. Do not assume a name. Greet "
            "generically (e.g. \"Hi there\") and do not invent personal details."
        )
    user = user_details.user
    return (
        "CURRENT USER (you are talking with this person right now):\n"
        f"- Address them by their display name: {user_details.display_name!r}.\n"
        f"- Their first name is {user.first_name!r} — you may use it for warmth "
        "in greetings, but default to the display name in direct address.\n"
        f"- Their last name is {user.last_name!r} — use only on formal request.\n"
        f"- Email: {user.email!r} — do NOT quote this back unless the user "
        "explicitly asks you to confirm it.\n"
        f"- Internal user ID: {user_details.id} — only quote this if explicitly requested by the user.\n"
        "- Match the language the user writes in.\n"
        "- On the first turn, greet them by name if available. Don't greet again on subsequent turns unless they greet you first."
    )


def run_bob_assistant_task(
    conversation_id: str,
    *,
    assistant_name: str,
    llm_client: LLMClient,
    behavior_prompt: str,
    user_id: str | None = None,
    task: Task | None = None,
    task_manager: TasksManager = None,
) -> str:

    # 1. Load conversation
    conversation_db = Conversation.by_id(conversation_id)
    if conversation_db is None:
        raise ValueError(f"Conversation {conversation_id} not found")  # noqa: TRY003

    # _set_task_progress(task, task_manager, 5.0)

    with context_db() as db:
        messages_db: list[Message] = (
            db.query(Message)
            .filter(Message.conversation_id == conversation_db.id)
            .order_by(Message.time_created.asc())  # type: ignore[attr-defined]
            .all()
        )

    if not messages_db:
        raise ValueError(  # noqa: TRY003
            f"Conversation {conversation_id} has no messages"
        )

    # 2. Build conversation history and auth token
    non_thinking_messages: list[Message] = [
        m for m in messages_db if m.kind != _THINKING_KIND
    ]
    auth_token = _resolve_auth_token(non_thinking_messages, user_id)

    # 3. Resolve MCP server URL
    mcp_server_url = _resolve_assistant_mcp_server_url()
    if not mcp_server_url:
        print_color(
            "yellow",
            "[bob-assistant] no MCP server configured — running without MCP tools",
        )

    # 4. Run Bob conversation
    # conversation_messages = build_conversation_messages(non_thinking_messages)
    last_message: Message = non_thinking_messages[-1]
    user_details = _get_user_details(user_id)
    current_user_prompt_details = _build_current_user_prompt_block(user_details)

    runtime = BobRuntime()
    # all but last message
    for message in non_thinking_messages[:-1]:
        if message.kind == _AI_RESPONSE_KIND:
            message_speaker = "assistant"
        else:
            author_details = _get_user_details(message.author_id)
            message_speaker = author_details.display_name if author_details else "user"
        runtime.conversation.add_message(
            speaker=message_speaker,
            content=message.content or "<empty message>",
            kind=message.kind,
        )
    build_plan_tools(runtime.shared_registry, runtime.plans)
    # build_file_editor_tools(runtime.shared_registry, WORKSPACE_DIRECTORY)
    build_report_tools(
        runtime.shared_registry,
        snapshots_directory=mkdtemp(prefix="bob_report_snapshots_"),
    )
    # TODO ADD MCP TOOLS

    ConversationAgent(
        name=assistant_name,
        client=llm_client,
        behavior_prompt=behavior_prompt + "\n\n" + current_user_prompt_details,
        max_tool_calls_per_session=ASSISTANTS_SETTINGS.ASSISTANT_MAX_TOOL_CALLS,
    ).watch(runtime).start()

    try:
        run_bob_shell_turn(
            runtime,
            speaker=user_details.display_name if user_details else "user",
            content=last_message.content or "<empty message>",
            timeout_seconds=120.0,
        )
    except TimeoutError as error:
        print_color("yellow", f"[bob-assistant] timed out: {error}")
    finally:
        runtime.stop_looper()
        looper_thread = runtime.looper_thread
        if looper_thread is not None:
            looper_thread.join(timeout=2)

    # OLD PATTERN:
    # reply_content, thinking_content = run_bob_conversation(
    #     conversation_messages=conversation_messages,
    #     assistant_name=assistant_name,
    #     client=llm_client,
    #     behavior_prompt=behavior_prompt,
    #     mcp_server_url=mcp_server_url,
    #     auth_token=auth_token,
    #     max_tool_calls=ASSISTANTS_SETTINGS.ASSISTANT_MAX_TOOL_CALLS,
    # )
    # NEW PATTERN: run_bob_shell_turn mutates the runtime's conversation in-place, so we can extract the final reply and thinking content from the runtime after it finishes.
    assistant_messages = [
        m for m in runtime.conversation.messages if m.speaker == assistant_name
    ]
    if assistant_messages:
        reply_content = str(assistant_messages[-1].content or "").strip()
        print_color("cyan", f"[bob-assistant] reply ({len(reply_content)} chars)")
    else:
        reply_content = _FALLBACK_REPLY
        print_color("yellow", "[bob-assistant] no reply found — using fallback")

    thinking_content = format_bob_thinking(runtime.history)

    print_color("cyan", f"[bob-assistant] reply ({len(reply_content)} chars)")
    _set_task_progress(task, task_manager, 90.0)

    # 5. Persist to DB
    thinking_is_meaningful = (
        thinking_content.strip()
        and thinking_content.strip() != "**Assistant reasoning steps:**"
    )
    if thinking_is_meaningful:
        Message.create(
            obj_dict={
                "conversation_id": str(conversation_db.id),
                "content": thinking_content,
                "kind": _THINKING_KIND,
                "title": f"{assistant_name} thinking",
            }
        )
        print_color("cyan", "[bob-assistant] saved thinking message")

    new_message = Message.create(
        obj_dict={
            "conversation_id": str(conversation_db.id),
            "content": reply_content,
            "kind": _AI_RESPONSE_KIND,
            "title": f"{assistant_name} reply",
        }
    )
    print_color("green", f"[bob-assistant] saved reply as message {new_message.id}")
    return str(new_message.id)
