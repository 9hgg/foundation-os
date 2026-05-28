import uuid
from typing import Any

from pydantic import Field as PydanticField

from libs.utils.types import BaseModelWithConfig


class SimulationVariable(BaseModelWithConfig):
    name: str
    causality: str | None = None
    variability: str | None = None
    value_reference: int | None = None
    type_name: str | None = None
    start: str | None = None
    description: str | None = None


class FmuInspectionResult(BaseModelWithConfig):
    model_name: str | None = None
    guid: str | None = None
    fmi_version: str | None = None
    variables: list[SimulationVariable] = PydanticField(default_factory=list)


class SimulationRunRequest(BaseModelWithConfig):
    start_time: float = 0.0
    stop_time: float = 10.0
    output_interval: float | None = None
    input_parameters: dict[str, Any] | None = None
    output_variables: list[str] | None = None


class FmuInspectionRequest(BaseModelWithConfig):
    file_id: uuid.UUID


class SimulationSeriesResult(BaseModelWithConfig):
    time: list[float | bool | str | None] = PydanticField(default_factory=list)
    series: dict[str, list[float | bool | str | None]] = PydanticField(
        default_factory=dict
    )


class SimulationArtifact(BaseModelWithConfig):
    file_id: uuid.UUID
    start_time: float
    stop_time: float
    output_interval: float | None = None
    input_parameters: dict[str, Any] | None = None
    result: SimulationSeriesResult


class ModelicaConvertRequest(BaseModelWithConfig):
    perimeter_id: uuid.UUID | None = None
    file_id: uuid.UUID
    model_name: str | None = None


class ModelicaConvertResult(BaseModelWithConfig):
    model_name: str
    fmu_path: str
    build_output: str | list[Any]


class SimulationArtifactRef(BaseModelWithConfig):
    format: str = "json+storage"
    file_id: uuid.UUID
