import uuid

from libs.tasks.tasks_manager import TasksManager

from .methods import (
    convert_modelica_file_from_id,
    run_simulation_from_file_id,
)
from .models import SimulationRunRequest


def _set_task_progress(task, task_manager, progress: float) -> None:
    if task is None or task_manager is None:
        return
    task_manager.update_task(task.id, {"progress": progress})


@TasksManager.enlist_task()
def run_fmu_simulation_task(
    *,
    perimeter_id: uuid.UUID | None = None,
    file_id: uuid.UUID,
    start_time: float = 0.0,
    stop_time: float = 10.0,
    output_interval: float | None = None,
    input_parameters: dict | None = None,
    task=None,
    task_manager=None,
):
    _set_task_progress(task, task_manager, 5.0)
    simulation_run_request = SimulationRunRequest(
        start_time=start_time,
        stop_time=stop_time,
        output_interval=output_interval,
        input_parameters=input_parameters,
    )
    _set_task_progress(task, task_manager, 30.0)
    simulation_series_result, artifact_ref = run_simulation_from_file_id(
        file_id=file_id,
        simulation_run_request=simulation_run_request,
    )
    _set_task_progress(task, task_manager, 100.0)
    return {
        "perimeter_id": str(perimeter_id) if perimeter_id else None,
        "artifact_ref": artifact_ref.model_dump(),
        "artifact_file_id": str(artifact_ref.file_id),
        "storage_based": True,
        "series_count": len(simulation_series_result.series),
        "sample_count": len(simulation_series_result.time),
    }


@TasksManager.enlist_task()
def convert_modelica_file_to_fmu_task(
    *,
    perimeter_id: uuid.UUID | None = None,
    file_id: uuid.UUID,
    model_name: str | None = None,
    task=None,
    task_manager=None,
):
    _set_task_progress(task, task_manager, 10.0)
    conversion_result, generated_fmu_file_id = convert_modelica_file_from_id(
        file_id=file_id,
        model_name=model_name,
    )
    _set_task_progress(task, task_manager, 100.0)
    return {
        "perimeter_id": str(perimeter_id) if perimeter_id else None,
        "conversion": conversion_result.model_dump(),
        "generated_fmu_file_id": str(generated_fmu_file_id),
        "storage_based": True,
    }
