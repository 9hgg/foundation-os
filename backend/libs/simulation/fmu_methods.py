import json
import os
import platform
import shutil
import subprocess
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any

from .errors import SimulationError
from .models import FmuInspectionResult, SimulationRunRequest, SimulationSeriesResult, SimulationVariable

DEFAULT_FMU_SIMULATION_DOCKER_IMAGE = "ghcr.io/astral-sh/uv:python3.12-bookworm"
DOCKER_FMU_SIMULATION_SCRIPT = r"""
import json
import sys

from fmpy import simulate_fmu


def normalize(value):
    value = value.item() if hasattr(value, "item") else value
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, (int, float)):
        return float(value)
    return str(value)


request = json.loads(sys.argv[2])
raw_result = simulate_fmu(
    sys.argv[1],
    start_time=request["start_time"],
    stop_time=request["stop_time"],
    output_interval=request["output_interval"],
    start_values=request["input_parameters"] or {},
    output=request.get("output_variables"),
)
dtype_names = raw_result.dtype.names if hasattr(raw_result, "dtype") else None
if not dtype_names:
    raise RuntimeError("No structured output has been returned by the simulation.")

all_series = {
    name: [normalize(value) for value in raw_result[name]]
    for name in dtype_names
}
print(json.dumps({
    "time": all_series.get("time", []),
    "series": {
        name: values
        for name, values in all_series.items()
        if name != "time"
    },
}))
"""


def _fmu_binary_platforms(*, fmu_path: str) -> set[str]:
    with zipfile.ZipFile(fmu_path, "r") as fmu_zip:
        platforms: set[str] = set()
        for name in fmu_zip.namelist():
            parts = name.split("/")
            if len(parts) >= 3 and parts[0] == "binaries" and parts[1]:
                platforms.add(parts[1])
        return platforms


def _host_fmu_platform_candidates() -> set[str]:
    machine = platform.machine().lower()
    system = platform.system()
    if system == "Darwin":
        return {"darwin64", "x86_64-darwin", "aarch64-darwin"}
    if system == "Linux":
        return {"linux64", "x86_64-linux", "aarch64-linux"}
    if system == "Windows":
        return {"win64", "x86_64-windows"}
    if machine in {"x86_64", "amd64"}:
        return {"linux64", "darwin64", "win64"}
    return set()


def _fmu_can_run_on_host(*, fmu_path: str) -> bool:
    platforms = _fmu_binary_platforms(fmu_path=fmu_path)
    if not platforms:
        return True
    return bool(platforms & _host_fmu_platform_candidates())


def _docker_platform_for_fmu(*, fmu_path: str) -> str | None:
    binary_machine = _fmu_linux_binary_machine(fmu_path=fmu_path)
    if binary_machine == 62:
        return "linux/amd64"
    if binary_machine == 183:
        return "linux/arm64"

    platforms = _fmu_binary_platforms(fmu_path=fmu_path)
    if platforms & {"linux64", "x86_64-linux"}:
        return "linux/amd64"
    if "aarch64-linux" in platforms:
        return "linux/arm64"
    return None


def _fmu_linux_binary_machine(*, fmu_path: str) -> int | None:
    with zipfile.ZipFile(fmu_path, "r") as fmu_zip:
        for name in fmu_zip.namelist():
            if not name.startswith("binaries/") or name.endswith("/"):
                continue
            if "/linux" not in name and "linux" not in name:
                continue
            header = fmu_zip.read(name)[:20]
            if len(header) < 20 or header[:4] != b"\x7fELF":
                continue
            if header[5] == 1:
                return int.from_bytes(header[18:20], "little")
            if header[5] == 2:
                return int.from_bytes(header[18:20], "big")
    return None


def _fmu_simulation_backend(*, fmu_path: str) -> str:
    configured = os.getenv("BOB_FMU_SIMULATION_BACKEND", "auto").lower()
    if configured != "auto":
        return configured
    if _fmu_can_run_on_host(fmu_path=fmu_path):
        return "local"
    return "docker"


def _fmu_platform_error(*, fmu_path: str) -> SimulationError:
    platforms = _fmu_binary_platforms(fmu_path=fmu_path)
    raise SimulationError(
        title="FMU platform incompatible",
        description=(
            "This FMU does not contain binaries compatible with the current host. "
            f"Available FMU platforms: {sorted(platforms)}. "
            "If it was generated with Docker/OpenModelica on macOS, run simulation "
            "in a compatible Linux environment."
        ),
        code="fmu_platform_incompatible",
        details={
            "available_platforms": sorted(platforms),
            "host": platform.system(),
            "machine": platform.machine(),
        },
    )


def _docker_user_args() -> list[str]:
    if not hasattr(os, "getuid") or not hasattr(os, "getgid"):
        return []
    return ["--user", f"{os.getuid()}:{os.getgid()}"]


def _extract_scalar_type_and_start(
    scalar_variable_element: ET.Element,
) -> tuple[str | None, str | None]:
    for child in scalar_variable_element:
        tag_name = child.tag.split("}")[-1]
        if tag_name in {"Real", "Integer", "Boolean", "String", "Enumeration"}:
            return tag_name, child.attrib.get("start")
    return None, None


def inspect_fmu_from_local_path(*, fmu_path: str) -> FmuInspectionResult:
    try:
        with zipfile.ZipFile(fmu_path, "r") as fmu_zip:
            try:
                model_description_as_bytes = fmu_zip.read("modelDescription.xml")
            except KeyError as error:
                raise SimulationError(
                    title="Invalid FMU",
                    description="modelDescription.xml is missing from the FMU archive.",
                    code="invalid_fmu_archive",
                ) from error
    except zipfile.BadZipFile as error:
        raise SimulationError(
            title="Invalid FMU",
            description="The provided file is not a valid FMU archive.",
            code="invalid_fmu_archive",
        ) from error

    root = ET.fromstring(model_description_as_bytes)  # noqa: S314
    model_variables_root = root.find(".//{*}ModelVariables")

    variables: list[SimulationVariable] = []
    if model_variables_root is not None:
        for scalar_variable in model_variables_root.findall("{*}ScalarVariable"):
            variable_type_name, variable_start = _extract_scalar_type_and_start(
                scalar_variable
            )
            value_reference = scalar_variable.attrib.get("valueReference")
            value_reference_as_int = (
                int(value_reference) if value_reference is not None else None
            )
            variables.append(
                SimulationVariable(
                    name=scalar_variable.attrib.get("name", ""),
                    causality=scalar_variable.attrib.get("causality"),
                    variability=scalar_variable.attrib.get("variability"),
                    value_reference=value_reference_as_int,
                    type_name=variable_type_name,
                    start=variable_start,
                    description=scalar_variable.attrib.get("description"),
                )
            )

    return FmuInspectionResult(
        model_name=root.attrib.get("modelName"),
        guid=root.attrib.get("guid"),
        fmi_version=root.attrib.get("fmiVersion"),
        variables=variables,
    )


def _normalize_series_value(value: Any) -> float | bool | str | None:
    value_item = value.item() if hasattr(value, "item") else value
    if value_item is None:
        return None
    if isinstance(value_item, (bool, str)):
        return value_item
    if isinstance(value_item, (int, float)):
        return float(value_item)
    return str(value_item)


def run_fmu_simulation(
    *, fmu_path: str, simulation_run_request: SimulationRunRequest
) -> SimulationSeriesResult:
    try:
        from fmpy import simulate_fmu
    except Exception as error:
        raise SimulationError(
            title="Missing dependency",
            description="FMU simulation requires the optional `fmpy` package.",
            code="simulation_dependency_missing",
        ) from error

    try:
        raw_result = simulate_fmu(
            fmu_path,
            start_time=simulation_run_request.start_time,
            stop_time=simulation_run_request.stop_time,
            output_interval=simulation_run_request.output_interval,
            start_values=simulation_run_request.input_parameters,
            output=simulation_run_request.output_variables,
        )
    except Exception as error:
        raise SimulationError(
            title="Simulation failed",
            description=str(error),
            code="simulation_failed",
        ) from error

    dtype_names = raw_result.dtype.names if hasattr(raw_result, "dtype") else None
    if not dtype_names:
        raise SimulationError(
            title="Simulation output error",
            description="No structured output has been returned by the simulation.",
            code="invalid_simulation_output",
        )

    all_series: dict[str, list[float | bool | str | None]] = {}
    for series_name in dtype_names:
        all_series[series_name] = [
            _normalize_series_value(value) for value in raw_result[series_name]
        ]

    time_values = all_series.get("time", [])
    exported_series = {
        series_name: values
        for series_name, values in all_series.items()
        if series_name != "time"
    }
    return SimulationSeriesResult(time=time_values, series=exported_series)


def _run_fmu_simulation_with_docker(
    *, fmu_path: str, simulation_run_request: SimulationRunRequest
) -> SimulationSeriesResult:
    docker = shutil.which("docker")
    if docker is None:
        raise SimulationError(
            title="Docker unavailable",
            description=(
                "FMU simulation needs Docker because the FMU is not compatible "
                "with the current host, but the docker executable is unavailable."
            ),
            code="fmu_docker_missing",
        )

    fmu_source = Path(fmu_path).resolve()
    image = os.getenv("BOB_FMU_SIMULATION_DOCKER_IMAGE", DEFAULT_FMU_SIMULATION_DOCKER_IMAGE)
    request_json = json.dumps(
        {
            "start_time": simulation_run_request.start_time,
            "stop_time": simulation_run_request.stop_time,
            "output_interval": simulation_run_request.output_interval,
            "input_parameters": simulation_run_request.input_parameters,
            "output_variables": simulation_run_request.output_variables,
        }
    )
    command = [
        docker,
        "run",
        "--rm",
        "-v",
        f"{fmu_source.parent}:/fmu",
        "-v",
        "bob_uv_cache:/tmp/uv-cache",
        "-e",
        "UV_CACHE_DIR=/tmp/uv-cache",
        *_docker_user_args(),
        image,
        "uv",
        "run",
        "--with",
        "fmpy",
        "python",
        "-c",
        DOCKER_FMU_SIMULATION_SCRIPT,
        f"/fmu/{fmu_source.name}",
        request_json,
    ]
    docker_platform = os.getenv("BOB_FMU_SIMULATION_DOCKER_PLATFORM") or _docker_platform_for_fmu(
        fmu_path=fmu_path
    )
    if docker_platform:
        command[3:3] = ["--platform", docker_platform]

    completed = subprocess.run(  # noqa: S603
        command,
        text=True,
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        output = "\n".join(
            part
            for part in (completed.stdout.strip(), completed.stderr.strip())
            if part
        )
        raise SimulationError(
            title="FMU Docker simulation failed",
            description=output or f"docker exited with status {completed.returncode}",
            code="fmu_docker_simulation_failed",
            details={"command": command, "returncode": completed.returncode},
        )

    try:
        payload = json.loads(completed.stdout.strip().splitlines()[-1])
        return SimulationSeriesResult.model_validate(payload)
    except Exception as error:
        raise SimulationError(
            title="FMU Docker simulation output error",
            description="The Docker simulation did not return a valid JSON result.",
            code="fmu_docker_simulation_output_invalid",
            details={"stdout": completed.stdout, "stderr": completed.stderr},
        ) from error

def run_simulation_from_local_path(
    *,
    fmu_path: str,
    start_time: float = 0.0,
    stop_time: float = 10.0,
    output_interval: float | None = None,
    input_parameters: dict[str, Any] | None = None,
    output_variables: list[str] | None = None,
) -> SimulationSeriesResult:
    if not os.path.exists(fmu_path):
        raise SimulationError(
            title="FMU not found",
            description=f"The FMU file {fmu_path} does not exist.",
            code="fmu_not_found",
        )

    simulation_run_request = SimulationRunRequest(
        start_time=start_time,
        stop_time=stop_time,
        output_interval=output_interval,
        input_parameters=input_parameters,
        output_variables=output_variables,
    )
    backend = _fmu_simulation_backend(fmu_path=fmu_path)
    if backend == "local":
        if not _fmu_can_run_on_host(fmu_path=fmu_path):
            raise _fmu_platform_error(fmu_path=fmu_path)
        return run_fmu_simulation(
            fmu_path=fmu_path, simulation_run_request=simulation_run_request
        )
    if backend == "docker":
        return _run_fmu_simulation_with_docker(
            fmu_path=fmu_path,
            simulation_run_request=simulation_run_request,
        )
    raise SimulationError(
        title="Unknown FMU simulation backend",
        description=(
            "BOB_FMU_SIMULATION_BACKEND must be one of 'auto', 'local', or "
            f"'docker'. Got {backend!r}."
        ),
        code="fmu_simulation_backend_unknown",
    )
