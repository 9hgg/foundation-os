from fastapi import APIRouter, BackgroundTasks

from libs.endpoints.endpoints import get_resource_if_READ_allowed
from libs.tasks.methods import launch_tasks_processing
from libs.tasks.models import Task
from libs.tasks.tasks_manager import TasksManager
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from . import tasks as simulation_tasks  # noqa: F401  # Task registration side-effect import.
from .errors import SimulationError
from .methods import inspect_fmu_from_file_id, load_simulation_artifact
from .models import (
    FmuInspectionRequest,
    ModelicaConvertRequest,
    SimulationArtifactRef,
    SimulationRunRequest,
)


def create_simulation_router() -> APIRouter:
    simulation_router = APIRouter()

    @simulation_router.post("/api/simulation/fmu/inspect", tags=["simulation"])
    async def inspect_fmu(body: FmuInspectionRequest, classic_deps: ClassicDeps__dep):
        current_user_db, session_db, translator = classic_deps

        file_db = get_resource_if_READ_allowed(
            current_user_db=current_user_db,
            session_db=session_db,
            resource_kind="file",
            resource_id=body.file_id,
        )
        if file_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate(
                        "You do not have read access to this file."
                    ),
                    code="unauthorized",
                )
            )

        try:
            result = inspect_fmu_from_file_id(file_id=file_db.id)
            return EndpointOutput(result=result.model_dump())
        except SimulationError as error:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("FMU inspection failed"),
                    description=translator.translate("Unable to inspect this FMU file."),
                    code="fmu_inspection_failed",
                    details={
                        "simulationError": {
                            "title": error.title,
                            "description": error.description,
                            "code": error.code,
                            "details": error.details,
                        }
                    },
                )
            )

    @simulation_router.post("/api/simulation/fmu/run", tags=["simulation", "tasks"])
    async def run_fmu_simulation(
        body: SimulationRunRequest,
        background_tasks: BackgroundTasks,
        classic_deps: ClassicDeps__dep,
    ):
        current_user_db, session_db, translator = classic_deps

        file_db = get_resource_if_READ_allowed(
            current_user_db=current_user_db,
            session_db=session_db,
            resource_kind="file",
            resource_id=body.file_id,
        )
        if file_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate(
                        "You do not have read access to this file."
                    ),
                    code="unauthorized",
                )
            )

        task_db = TasksManager.create_task(
            method_name="run_fmu_simulation_task",
            title="Run FMU simulation",
            kwargs={
                "perimeter_id": body.perimeter_id,
                "file_id": file_db.id,
                "start_time": body.start_time,
                "stop_time": body.stop_time,
                "output_interval": body.output_interval,
                "input_parameters": body.input_parameters,
            },
        )
        background_tasks.add_task(launch_tasks_processing)
        return EndpointOutput(result={"taskId": str(task_db.id)})

    @simulation_router.post(
        "/api/simulation/modelica/convert", tags=["simulation", "tasks"]
    )
    async def convert_modelica_to_fmu(
        body: ModelicaConvertRequest,
        background_tasks: BackgroundTasks,
        classic_deps: ClassicDeps__dep,
    ):
        current_user_db, session_db, translator = classic_deps

        file_db = get_resource_if_READ_allowed(
            current_user_db=current_user_db,
            session_db=session_db,
            resource_kind="file",
            resource_id=body.file_id,
        )
        if file_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate(
                        "You do not have read access to this file."
                    ),
                    code="unauthorized",
                )
            )

        task_db = TasksManager.create_task(
            method_name="convert_modelica_file_to_fmu_task",
            title="Convert Modelica script to FMU",
            kwargs={
                "perimeter_id": body.perimeter_id,
                "file_id": file_db.id,
                "model_name": body.model_name,
            },
        )
        background_tasks.add_task(launch_tasks_processing)
        return EndpointOutput(result={"taskId": str(task_db.id)})

    @simulation_router.get("/api/simulation/tasks/{task_id}/artifact", tags=["simulation"])
    async def get_simulation_artifact(task_id: str, classic_deps: ClassicDeps__dep):
        current_user_db, session_db, translator = classic_deps
        task_db = Task.by_id(task_id)
        if task_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Task not found"),
                    description=translator.translate(f"Unable to find task {task_id}."),
                    code="task_not_found",
                )
            )

        artifacts = task_db.artifacts or {}
        return_value = artifacts.get("return_value")
        if not isinstance(return_value, dict):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Artifact unavailable"),
                    description=translator.translate(
                        "The task has no simulation artifact."
                    ),
                    code="artifact_not_found",
                )
            )
        artifact_ref_raw = return_value.get("artifact_ref")
        if not isinstance(artifact_ref_raw, dict):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Artifact unavailable"),
                    description=translator.translate(
                        "The task has no simulation artifact reference."
                    ),
                    code="artifact_not_found",
                )
            )

        try:
            artifact_ref = SimulationArtifactRef.model_validate(artifact_ref_raw)
            artifact_file_db = get_resource_if_READ_allowed(
                current_user_db=current_user_db,
                session_db=session_db,
                resource_kind="file",
                resource_id=artifact_ref.file_id,
            )
            if artifact_file_db is None:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Unauthorized"),
                        description=translator.translate(
                            "You do not have read access to this simulation artifact."
                        ),
                        code="unauthorized",
                    )
                )
            artifact = load_simulation_artifact(artifact_ref=artifact_ref)
            return EndpointOutput(result=artifact.model_dump())
        except FileNotFoundError:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Artifact unavailable"),
                    description=translator.translate(
                        "The simulation artifact file no longer exists."
                    ),
                    code="artifact_not_found",
                )
            )
        except SimulationError as error:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Simulation artifact failed"),
                    description=translator.translate(
                        "Unable to load the simulation artifact."
                    ),
                    code="simulation_artifact_failed",
                    details={
                        "simulationError": {
                            "title": error.title,
                            "description": error.description,
                            "code": error.code,
                            "details": error.details,
                        }
                    },
                )
            )

    return simulation_router
