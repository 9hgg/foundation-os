import os
import platform
import re
import shutil
import subprocess
from pathlib import Path

from .errors import SimulationError
from .models import ModelicaConvertResult

DEFAULT_OPENMODELICA_DOCKER_IMAGE = "openmodelica/openmodelica:v1.26.3-gui"
DEFAULT_MACOS_MODELICA_DOCKER_PLATFORM = "linux/amd64"


def _modelica_backend() -> str:
    configured = os.getenv("MODELICA_BACKEND", "auto").lower()
    if configured != "auto":
        return configured
    if platform.system() == "Darwin":
        # Docker-based conversion is more consistent on macOS due to better isolation from host system differences, so we default to that.
        return "docker"
    return "local"


def _detect_model_name_in_modelica_script(*, modelica_script: str) -> str | None:
    model_name_match = re.search(
        r"\bmodel\s+([A-Za-z_][A-Za-z0-9_]*)\b", modelica_script
    )
    if model_name_match is None:
        return None
    return model_name_match.group(1)


def _escape_modelica_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _docker_user_args() -> list[str]:
    if not hasattr(os, "getuid") or not hasattr(os, "getgid"):
        return []
    return ["--user", f"{os.getuid()}:{os.getgid()}"]


def _modelica_docker_platform() -> str | None:
    configured = os.getenv("MODELICA_DOCKER_PLATFORM")
    if configured:
        return configured
    if platform.system() == "Darwin":
        return DEFAULT_MACOS_MODELICA_DOCKER_PLATFORM
    return None


def _convert_modelica_script_to_fmu_with_docker(
    *, modelica_script_path: str, model_name: str
) -> ModelicaConvertResult:
    docker = shutil.which("docker")
    if docker is None:
        raise SimulationError(
            title="Docker unavailable",
            description=(
                "Modelica conversion is configured for Docker but the docker "
                "executable is not available."
            ),
            code="modelica_docker_missing",
        )

    source_path = Path(modelica_script_path).resolve()
    workspace = source_path.parent
    existing_fmus = {path.resolve() for path in workspace.glob("*.fmu")}
    mos_path = workspace / f"build_{model_name}.mos"
    mos_path.write_text(
        "\n".join(
            [
                f'loadFile("{_escape_modelica_string(source_path.name)}");',
                f"buildModelFMU({model_name});",
                "getErrorString();",
                "",
            ]
        ),
        encoding="utf-8",
    )

    image = os.getenv("MODELICA_DOCKER_IMAGE", DEFAULT_OPENMODELICA_DOCKER_IMAGE)
    command = [
        docker,
        "run",
        "--rm",
        "-v",
        f"{workspace}:/workspace",
        "-w",
        "/workspace",
        *_docker_user_args(),
        image,
        "omc",
        mos_path.name,
    ]
    docker_platform = _modelica_docker_platform()
    if docker_platform:
        command[3:3] = ["--platform", docker_platform]
    completed = subprocess.run(  # noqa: S603
        command,
        text=True,
        capture_output=True,
        check=False,
    )
    output = "\n".join(
        part
        for part in (
            completed.stdout.strip(),
            completed.stderr.strip(),
        )
        if part
    )
    if completed.returncode != 0:
        raise SimulationError(
            title="OpenModelica Docker conversion failed",
            description=output or f"docker exited with status {completed.returncode}",
            code="modelica_docker_conversion_failed",
            details={"command": command, "returncode": completed.returncode},
        )

    generated_fmus = [
        path
        for path in workspace.glob("*.fmu")
        if path.resolve() not in existing_fmus
    ]
    if not generated_fmus:
        generated_fmus = sorted(
            workspace.glob("*.fmu"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
    if not generated_fmus:
        raise SimulationError(
            title="FMU output missing",
            description="OpenModelica completed but no FMU was found in the workspace.",
            code="modelica_fmu_missing",
            details={"output": output},
        )

    fmu_path = str(generated_fmus[0])
    return ModelicaConvertResult(
        model_name=model_name,
        fmu_path=fmu_path,
        build_output=output,
    )


def _convert_modelica_script_to_fmu_locally(
    *, modelica_script_path: str, model_name: str
) -> ModelicaConvertResult:
    try:
        from OMPython import OMCSessionZMQ
    except Exception as error:
        raise SimulationError(
            title="Missing dependency",
            description="Modelica conversion requires OpenModelica + `ompython`.",
            code="modelica_dependency_missing",
        ) from error

    omc_session = OMCSessionZMQ()
    escaped_path = modelica_script_path.replace("\\", "\\\\")
    model_loaded = omc_session.sendExpression(f'loadFile("{escaped_path}")')
    if not model_loaded:
        raise SimulationError(
            title="OpenModelica load failed",
            description=f"Unable to load {modelica_script_path} in OpenModelica.",
            code="modelica_load_failed",
        )

    build_output = omc_session.sendExpression(f"buildModelFMU({model_name})")
    fmu_path: str
    if (
        isinstance(build_output, tuple | list)
        and len(build_output) > 0
    ):
        fmu_path = str(build_output[0])
    else:
        fmu_path = str(build_output)

    return ModelicaConvertResult(
        model_name=model_name,
        fmu_path=fmu_path,
        build_output=build_output,
    )


def convert_modelica_script_to_fmu(
    *, modelica_script_path: str, model_name: str | None = None
) -> ModelicaConvertResult:
    with open(modelica_script_path, encoding="utf-8") as modelica_script_file:
        modelica_script = modelica_script_file.read()

    resolved_model_name = model_name or _detect_model_name_in_modelica_script(
        modelica_script=modelica_script
    )
    if resolved_model_name is None:
        raise SimulationError(
            title="Model name required",
            description="Unable to detect a model name from the Modelica script.",
            code="model_name_missing",
        )

    backend = _modelica_backend()
    if backend == "docker":
        return _convert_modelica_script_to_fmu_with_docker(
            modelica_script_path=modelica_script_path,
            model_name=resolved_model_name,
        )
    if backend == "local":
        return _convert_modelica_script_to_fmu_locally(
            modelica_script_path=modelica_script_path,
            model_name=resolved_model_name,
        )
    raise SimulationError(
        title="Unknown Modelica backend",
        description=(
            "MODELICA_BACKEND must be one of 'auto', 'local', or 'docker'. "
            f"Got {backend!r}."
        ),
        code="modelica_backend_unknown",
    )
