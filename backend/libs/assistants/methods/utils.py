from typing import Any

from libs.logger.customLogger import print_color
from libs.tasks.tasks_manager import TasksManager


def _log_response(msg: Any) -> None:
    content = getattr(msg, "content", "")
    tool_calls = getattr(msg, "tool_calls", [])
    if tool_calls:
        for tc in tool_calls:
            print_color(
                "cyan", f"  [AI] → tool_call: {tc.get('name')}({tc.get('args')})"
            )
        if isinstance(content, str) and content.strip():
            print_color("cyan", f"  [AI] reasoning: {content[:200]}")
    elif isinstance(content, str) and content.strip():
        print_color("cyan", f"  [AI]: {content[:300]}")




def _set_task_progress(task: Any, task_manager: TasksManager, progress: float) -> None:
    if task is None or task_manager is None:
        return
    print_color("magenta", f"[assistant] task progress: {progress:.1f}%")
    task_manager.update_task(task.id, {"progress": progress})

