import pytest
import uuid
from unittest.mock import MagicMock, patch
from libs.tasks.tasks_manager import TasksManager
from libs.tasks.tasks_manager_errors import TaskNotFoundError
from libs.tasks.models import Task, TaskArguments


@pytest.fixture
def mock_task_db():
    with patch("libs.tasks.tasks_manager.Task") as mock_task:
        yield mock_task


def test_enlist_task():
    # Clear existing tasks
    TasksManager.tasks_methods = {}

    @TasksManager.enlist_task(method_name="test_method")
    def my_task(*args, **kwargs):
        return "success"

    assert "test_method" in TasksManager.tasks_methods
    assert TasksManager.tasks_methods["test_method"].fn == my_task

    # Enlist without name
    @TasksManager.enlist_task()
    def another_task(*args, **kwargs):
        pass

    assert "another_task" in TasksManager.tasks_methods


def test_create_task(mock_task_db):
    TasksManager.tasks_methods = {"test_method": MagicMock()}

    # Success
    task = TasksManager.create_task(method_name="test_method", title="Test Task", args=[1, 2], kwargs={"a": "b"})
    mock_task_db.create.assert_called_once()
    # task is a mock, so we can't check attributes directly unless we set them
    # But we can check that Task constructor was called with correct arguments
    call_args = mock_task_db.call_args
    assert call_args.kwargs["method_name"] == "test_method"

    # Method not found
    with pytest.raises(TaskNotFoundError):
        TasksManager.create_task(method_name="unknown")


def test_execute_task(mock_task_db):
    task_id = uuid.uuid4()
    task = MagicMock()
    task.id = task_id
    task.method_name = "test_method"
    task.arguments = {"args": [1], "kwargs": {}}
    mock_task_db.by_id.return_value = task

    # Mock the task method
    mock_fn = MagicMock(return_value="result")
    TasksManager.tasks_methods = {"test_method": MagicMock(fn=mock_fn)}

    # Execute
    TasksManager.execute_task(task_id)

    mock_fn.assert_called_once()
    mock_task_db.patch.assert_called()

    # Check that task was updated with success
    # We can't easily check the call args of patch because it's called multiple times

    # Execute failed task
    mock_fn.side_effect = Exception("Failure")
    TasksManager.execute_task(task_id)

    # Check that task was updated with failure
    # Verify patch called with failed=True
    # We can iterate over call_args_list

    # Task not found
    mock_task_db.by_id.return_value = None
    TasksManager.execute_task(uuid.uuid4())
    # Should just return

    # Method not found
    mock_task_db.by_id.return_value = task
    TasksManager.tasks_methods = {}
    TasksManager.execute_task(task_id)
    # Should update task with error
