from __future__ import annotations

from pydantic import BaseModel

from libs.ralph.state.plan_models import ObjectiveAnswer, Plan, StepResult
from libs.ralph.tools.registry import ToolDescription


class DemoCustomer(BaseModel):
    """Fake customer profile used throughout the demo."""

    customer_id: str
    name: str
    email: str
    segment: str
    tier: str
    renewal_risk: str


class DemoInvoice(BaseModel):
    """Fake invoice for billing-oriented demo prompts."""

    invoice_id: str
    customer_id: str
    amount_eur: float
    status: str
    due_date: str


class DemoSupportTicket(BaseModel):
    """Fake support ticket for triage-oriented demo prompts."""

    ticket_id: str
    customer_id: str
    severity: str
    topic: str
    summary: str
    status: str


class DemoPolicyNote(BaseModel):
    """Lightweight internal policy excerpt."""

    topic: str
    guidance: str
    owner_team: str


class DemoIncident(BaseModel):
    """Fake product incident used as a pre-seeded artifact."""

    incident_id: str
    service: str
    impact: str
    suspected_root_cause: str
    next_action: str


class DemoRunReport(BaseModel):
    """Structured record of one demo run for pretty-printing."""

    query: str
    artifact_descriptions: list[dict[str, object]]
    observation_descriptions: list[dict[str, object]]
    tool_descriptions: list[ToolDescription]
    evidences: list[dict[str, object]]
    plan: Plan
    step_results: list[StepResult]
    answer: ObjectiveAnswer
