import json
import os
import tempfile
import uuid
from pathlib import Path

from libs.files.config import FILES_SETTINGS
from libs.files.models import File
from libs.files.storage import get_file_storage

from .errors import SimulationError
from .models import (
    FmuInspectionResult,
    ModelicaConvertResult,
    SimulationArtifact,
    SimulationArtifactRef,
    SimulationRunRequest,
    SimulationSeriesResult,
)


def save_simulation_artifact(*, artifact: SimulationArtifact) -> SimulationArtifactRef:
    artifact_payload = artifact.model_dump()
    artifact_as_json = json.dumps(artifact_payload, ensure_ascii=False, indent=2)
    artifact_size = float(len(artifact_as_json.encode("utf-8")))
    storage = get_file_storage(FILES_SETTINGS.DEFAULT_STORAGE_ID)
    storage_folder_path = str(uuid.uuid4())
    output_path = ""

    try:
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as output_file:
            output_file.write(artifact_as_json)
            output_path = output_file.name

        artifact_file_db = File(
            public_filename="simulation_artifact.json",
            original_filename="simulation_artifact.json",
            extension_client=".json",
            extension=".json",
            mime_client="application/json",
            mime="application/json",
            kind="simulation_artifact",
            size_client=artifact_size,
            size=artifact_size,
            storage_id=FILES_SETTINGS.DEFAULT_STORAGE_ID,
            storage_folder_path=storage_folder_path,
            in_storage=False,
        )
        File.create(obj=artifact_file_db)

        uploaded = storage.upload(
            local_path=output_path,
            storage_folder_path=storage_folder_path,
            alternative="original",
            force=True,
        )
        if not uploaded:
            raise SimulationError(
                title="Storage upload failed",
                description="The simulation artifact could not be uploaded.",
                code="simulation_artifact_upload_failed",
            )

        artifact_file_db.in_storage = True
        File.update(obj_id=artifact_file_db.id, new_obj=artifact_file_db)
    finally:
        if output_path and os.path.exists(output_path):
            os.remove(output_path)

    return SimulationArtifactRef(file_id=artifact_file_db.id)


def load_simulation_artifact(*, artifact_ref: SimulationArtifactRef) -> SimulationArtifact:
    artifact_file_db = File.by_id(artifact_ref.file_id)
    if (
        artifact_file_db is None
        or not artifact_file_db.in_storage
        or artifact_file_db.storage_id is None
        or artifact_file_db.storage_folder_path is None
    ):
        raise FileNotFoundError(artifact_ref.file_id)

    storage = get_file_storage(artifact_file_db.storage_id)
    local_path = storage.download(
        storage_folder_path=artifact_file_db.storage_folder_path,
        alternative="original",
        force=True,
    )
    if local_path is None:
        raise FileNotFoundError(artifact_ref.file_id)

    try:
        with open(local_path, encoding="utf-8") as artifact_file:
            data = json.load(artifact_file)
        return SimulationArtifact.model_validate(data)
    finally:
        if os.path.exists(local_path):
            os.remove(local_path)


def get_temp_file_from_storage(*, file_id: uuid.UUID) -> str:
    file_db = File.by_id(file_id)
    if file_db is None:
        raise SimulationError(
            title="File not found",
            description=f"Unable to find file {file_id}.",
            code="file_not_found",
        )
    if file_db.storage_id is None or file_db.storage_folder_path is None:
        raise SimulationError(
            title="Storage unavailable",
            description="The file is not available in storage.",
            code="file_storage_unavailable",
        )

    storage = get_file_storage(file_db.storage_id)
    original_alternative = storage.get_original_alternative(
        storage_folder_path=file_db.storage_folder_path
    )
    if original_alternative is None:
        raise SimulationError(
            title="Storage unavailable",
            description="The original file alternative cannot be found.",
            code="file_storage_unavailable",
        )

    extension = file_db.extension or file_db.extension_client or ""
    temporary_file_path = storage.get_temporary_local_path(suffix=extension)
    downloaded_path = storage.download(
        storage_folder_path=file_db.storage_folder_path,
        alternative=original_alternative,
        local_path=temporary_file_path,
        force=True,
    )
    if downloaded_path is None:
        raise SimulationError(
            title="Download failed",
            description="Unable to download the file from storage.",
            code="file_download_failed",
        )
    return downloaded_path


def save_generated_fmu_file(
    *,
    local_fmu_path: str,
    model_name: str,
) -> uuid.UUID:
    if not Path(local_fmu_path).exists():
        raise SimulationError(
            title="FMU output missing",
            description=f"The generated FMU path does not exist: {local_fmu_path}",
            code="generated_fmu_not_found",
        )

    storage = get_file_storage(FILES_SETTINGS.DEFAULT_STORAGE_ID)
    storage_folder_path = str(uuid.uuid4())
    fmu_size = float(Path(local_fmu_path).stat().st_size)
    fmu_filename = f"{model_name}.fmu"

    fmu_file_db = File(
        public_filename=fmu_filename,
        original_filename=fmu_filename,
        extension_client=".fmu",
        extension=".fmu",
        mime_client="application/fmu",
        mime="application/fmu",
        kind="fmu",
        size_client=fmu_size,
        size=fmu_size,
        storage_id=FILES_SETTINGS.DEFAULT_STORAGE_ID,
        storage_folder_path=storage_folder_path,
        in_storage=False,
    )
    File.create(obj=fmu_file_db)

    uploaded = storage.upload(
        local_path=local_fmu_path,
        storage_folder_path=storage_folder_path,
        alternative="original",
        force=True,
    )
    if not uploaded:
        raise SimulationError(
            title="Storage upload failed",
            description="The generated FMU could not be uploaded.",
            code="generated_fmu_upload_failed",
        )
    fmu_file_db.in_storage = True
    File.update(obj_id=fmu_file_db.id, new_obj=fmu_file_db)
    return fmu_file_db.id


# ---------------------------------------------------------------------------
# File-id storage wrappers
#
# These helpers replace the historic `*_from_file_id` functions that used to
# live in `methods.py` / `fmu_methods.py` / `modelica_methods.py`. They
# encapsulate the download → run-local → cleanup dance so the FastAPI task
# and route layers stay thin. The core simulation libraries themselves remain
# local-path-first (Bob and other in-process consumers don't pay the storage
# round-trip).
# ---------------------------------------------------------------------------


def inspect_fmu_from_file_id(*, file_id: uuid.UUID) -> FmuInspectionResult:
    """Download an FMU by file_id, inspect it, then clean up the temp file."""
    from .fmu_methods import inspect_fmu_from_local_path

    local_path = get_temp_file_from_storage(file_id=file_id)
    try:
        return inspect_fmu_from_local_path(fmu_path=local_path)
    finally:
        if os.path.exists(local_path):
            os.remove(local_path)


def convert_modelica_file_from_id(
    *,
    file_id: uuid.UUID,
    model_name: str | None = None,
) -> tuple[ModelicaConvertResult, uuid.UUID]:
    """Download a Modelica source by file_id, convert to FMU, persist it, cleanup.

    Returns ``(conversion_result, generated_fmu_file_id)``; the conversion
    result no longer carries the file id (it was dropped from the model in
    favour of a local-path-first core), so this helper handles the persistence
    and returns the id alongside.
    """
    from .modelica_methods import convert_modelica_script_to_fmu

    local_path = get_temp_file_from_storage(file_id=file_id)
    try:
        conversion_result = convert_modelica_script_to_fmu(
            modelica_script_path=local_path,
            model_name=model_name,
        )
        generated_fmu_file_id = save_generated_fmu_file(
            local_fmu_path=conversion_result.fmu_path,
            model_name=conversion_result.model_name,
        )
        return conversion_result, generated_fmu_file_id
    finally:
        if os.path.exists(local_path):
            os.remove(local_path)


def run_simulation_from_file_id(
    *,
    file_id: uuid.UUID,
    simulation_run_request: SimulationRunRequest,
) -> tuple[SimulationSeriesResult, SimulationArtifactRef]:
    """Download an FMU by file_id, run the simulation, persist the artifact, cleanup."""
    from .fmu_methods import run_fmu_simulation

    local_path = get_temp_file_from_storage(file_id=file_id)
    try:
        simulation_series_result = run_fmu_simulation(
            fmu_path=local_path,
            simulation_run_request=simulation_run_request,
        )
        artifact_ref = save_simulation_artifact(
            artifact=SimulationArtifact(
                file_id=file_id,
                start_time=simulation_run_request.start_time,
                stop_time=simulation_run_request.stop_time,
                output_interval=simulation_run_request.output_interval,
                input_parameters=simulation_run_request.input_parameters,
                result=simulation_series_result,
            )
        )
        return simulation_series_result, artifact_ref
    finally:
        if os.path.exists(local_path):
            os.remove(local_path)
