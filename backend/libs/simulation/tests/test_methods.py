import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest

from libs.simulation import fmu_methods, modelica_methods
from libs.simulation.methods import (
    SimulationError,
    convert_modelica_script_to_fmu,
    inspect_fmu_from_local_path,
    run_simulation_from_local_path,
)

ELF64_LITTLE_ENDIAN_X86_64_HEADER = b"\x7fELF\x02\x01\x01" + (b"\x00" * 11) + b"\x3e\x00"
ELF64_LITTLE_ENDIAN_AARCH64_HEADER = b"\x7fELF\x02\x01\x01" + (b"\x00" * 11) + b"\xb7\x00"


def test_inspect_fmu_extracts_variables(tmp_path: Path):
    fmu_path = tmp_path / "simple.fmu"
    model_description = """
    <fmiModelDescription fmiVersion="2.0" modelName="DemoModel" guid="123">
      <ModelVariables>
        <ScalarVariable name="x" valueReference="1" causality="input" variability="continuous">
          <Real start="0.0" />
        </ScalarVariable>
        <ScalarVariable name="y" valueReference="2" causality="output" variability="continuous">
          <Real />
        </ScalarVariable>
      </ModelVariables>
    </fmiModelDescription>
    """
    with zipfile.ZipFile(fmu_path, "w") as fmu_zip:
        fmu_zip.writestr("modelDescription.xml", model_description)

    inspection_result = inspect_fmu_from_local_path(fmu_path=str(fmu_path))

    assert inspection_result.model_name == "DemoModel"
    assert inspection_result.guid == "123"
    assert inspection_result.fmi_version == "2.0"
    assert len(inspection_result.variables) == 2
    assert inspection_result.variables[0].name == "x"
    assert inspection_result.variables[0].type_name == "Real"
    assert inspection_result.variables[0].start == "0.0"


def test_inspect_fmu_raises_error_without_model_description(tmp_path: Path):
    fmu_path = tmp_path / "invalid.fmu"
    with zipfile.ZipFile(fmu_path, "w") as fmu_zip:
        fmu_zip.writestr("dummy.txt", "hello")

    with pytest.raises(SimulationError) as error:
        inspect_fmu_from_local_path(fmu_path=str(fmu_path))

    assert error.value.code == "invalid_fmu_archive"


def test_convert_modelica_uses_docker_backend_on_mac(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    modelica_path = tmp_path / "Demo.mo"
    modelica_path.write_text("model Demo\n  Real x;\nend Demo;\n", encoding="utf-8")
    generated_fmu = tmp_path / "Demo.fmu"

    def fake_run(command, **kwargs):
        generated_fmu.write_bytes(b"fake fmu")
        return SimpleNamespace(returncode=0, stdout="Demo.fmu\n", stderr="")

    monkeypatch.setattr(modelica_methods.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(modelica_methods.shutil, "which", lambda name: "/usr/bin/docker")
    monkeypatch.setattr(modelica_methods.subprocess, "run", fake_run)

    result = convert_modelica_script_to_fmu(modelica_script_path=str(modelica_path))

    assert result.model_name == "Demo"
    assert result.fmu_path == str(generated_fmu)


def test_run_simulation_rejects_linux_fmu_on_mac(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    fmu_path = tmp_path / "linux_only.fmu"
    model_description = """
    <fmiModelDescription fmiVersion="2.0" modelName="DemoModel" guid="123" />
    """
    with zipfile.ZipFile(fmu_path, "w") as fmu_zip:
        fmu_zip.writestr("modelDescription.xml", model_description)
        fmu_zip.writestr("binaries/linux64/Demo.so", ELF64_LITTLE_ENDIAN_X86_64_HEADER)

    monkeypatch.setattr(fmu_methods.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(fmu_methods.platform, "machine", lambda: "arm64")
    monkeypatch.setenv("BOB_FMU_SIMULATION_BACKEND", "local")

    with pytest.raises(SimulationError) as error:
        run_simulation_from_local_path(fmu_path=str(fmu_path))

    assert error.value.code == "fmu_platform_incompatible"


def test_run_simulation_uses_docker_for_incompatible_fmu_on_mac(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    fmu_path = tmp_path / "linux_only.fmu"
    model_description = """
    <fmiModelDescription fmiVersion="2.0" modelName="DemoModel" guid="123" />
    """
    with zipfile.ZipFile(fmu_path, "w") as fmu_zip:
        fmu_zip.writestr("modelDescription.xml", model_description)
        fmu_zip.writestr("binaries/linux64/Demo.so", ELF64_LITTLE_ENDIAN_X86_64_HEADER)

    captured: dict[str, list[str]] = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        return SimpleNamespace(
            returncode=0,
            stdout='{"time":[0.0,1.0],"series":{"x":[1.0,0.5]}}\n',
            stderr="",
        )

    monkeypatch.setattr(fmu_methods.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(fmu_methods.platform, "machine", lambda: "arm64")
    monkeypatch.setattr(fmu_methods.shutil, "which", lambda name: "/usr/bin/docker")
    monkeypatch.setattr(fmu_methods.subprocess, "run", fake_run)

    result = run_simulation_from_local_path(fmu_path=str(fmu_path))

    assert result.time == [0.0, 1.0]
    assert result.series == {"x": [1.0, 0.5]}
    assert captured["command"][0] == "/usr/bin/docker"
    assert "--platform" in captured["command"]
    assert "linux/amd64" in captured["command"]


def test_run_simulation_uses_arm64_docker_for_aarch64_linux_fmu(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    fmu_path = tmp_path / "linux_arm64.fmu"
    model_description = """
    <fmiModelDescription fmiVersion="2.0" modelName="DemoModel" guid="123" />
    """
    with zipfile.ZipFile(fmu_path, "w") as fmu_zip:
        fmu_zip.writestr("modelDescription.xml", model_description)
        fmu_zip.writestr("binaries/linux64/Demo.so", ELF64_LITTLE_ENDIAN_AARCH64_HEADER)

    captured: dict[str, list[str]] = {}

    def fake_run(command, **kwargs):
        captured["command"] = command
        return SimpleNamespace(
            returncode=0,
            stdout='{"time":[0.0],"series":{"x":[1.0]}}\n',
            stderr="",
        )

    monkeypatch.setattr(fmu_methods.platform, "system", lambda: "Darwin")
    monkeypatch.setattr(fmu_methods.platform, "machine", lambda: "arm64")
    monkeypatch.setattr(fmu_methods.shutil, "which", lambda name: "/usr/bin/docker")
    monkeypatch.setattr(fmu_methods.subprocess, "run", fake_run)

    run_simulation_from_local_path(fmu_path=str(fmu_path))

    assert "--platform" in captured["command"]
    assert "linux/arm64" in captured["command"]
