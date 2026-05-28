"""Pydantic models representing plans, step results, and final answers."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PlanStep(BaseModel):
    """Single actionable step in an assistant-generated plan."""

    id: str
    instruction: str
    expected_output: str | None = None
    tool_names: list[str] = Field(default_factory=list)


class Plan(BaseModel):
    """Top-level plan produced for an objective."""

    objective: str
    steps: list[PlanStep] = Field(default_factory=list)


class StepResult(BaseModel):
    """Structured outcome recorded after attempting a plan step."""

    step_id: str
    success: bool
    summary: str
    artifact_keys: list[str] = Field(default_factory=list)
    evidence_keys: list[str] = Field(default_factory=list)
    observation_keys: list[str] = Field(default_factory=list)
    error: str | None = None


class ObjectiveAnswer(BaseModel):
    """Final answer emitted after the run is complete."""

    answer: str
    success: bool
    missing_information: list[str] = Field(default_factory=list)
