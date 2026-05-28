from __future__ import annotations

from typing import Any

from libs.ralph.state.run_context import AssistantRunContext
from libs.ralph.tools.local_tools import build_harness_tools
from libs.ralph.tools.registry import Tool, ToolRegistry

from .customers_demos_data import (
    CUSTOMERS,
    INVOICES,
    POLICIES,
    TICKETS,
)

customers_by_id = {customer.customer_id: customer for customer in CUSTOMERS}


def list_vip_customers() -> list[dict[str, Any]]:
    return [customer.model_dump() for customer in CUSTOMERS if customer.tier == "vip"]


def find_customer_by_email(email: str) -> dict[str, Any] | None:
    customer = next((item for item in CUSTOMERS if item.email == email), None)
    return customer.model_dump() if customer else None


def get_customer_tickets(customer_id: str) -> list[dict[str, Any]]:
    return [
        ticket.model_dump() for ticket in TICKETS if ticket.customer_id == customer_id
    ]


def get_overdue_invoices() -> list[dict[str, Any]]:
    return [invoice.model_dump() for invoice in INVOICES if invoice.status == "overdue"]


def summarize_customer_risk(customer_id: str) -> dict[str, Any]:
    customer = customers_by_id[customer_id]
    open_tickets = [ticket for ticket in TICKETS if ticket.customer_id == customer_id]
    overdue_total = sum(
        invoice.amount_eur
        for invoice in INVOICES
        if invoice.customer_id == customer_id and invoice.status == "overdue"
    )
    return {
        "customer": customer.name,
        "tier": customer.tier,
        "renewal_risk": customer.renewal_risk,
        "open_ticket_count": len(open_tickets),
        "overdue_total_eur": overdue_total,
    }


def search_policy(topic: str) -> list[dict[str, Any]]:
    return [
        policy.model_dump()
        for policy in POLICIES
        if topic.lower() in policy.topic.lower()
        or topic.lower() in policy.guidance.lower()
    ]


DEMO_TOOLS = [
    Tool(
        "list_vip_customers",
        "Return VIP customers from the CRM snapshot.",
        list_vip_customers,
    ),
    Tool(
        "find_customer_by_email",
        "Look up a customer profile by primary contact email.",
        find_customer_by_email,
    ),
    Tool(
        "get_customer_tickets",
        "Return support tickets for a customer id.",
        get_customer_tickets,
    ),
    Tool(
        "get_overdue_invoices",
        "Return overdue invoices only.",
        get_overdue_invoices,
    ),
    Tool(
        "summarize_customer_risk",
        "Summarize renewal risk, open tickets, and overdue billing for one customer.",
        summarize_customer_risk,
    ),
    Tool("search_policy", "Search policy notes by topic or keyword.", search_policy),
]


def enlist_demo_tools(ctx: AssistantRunContext) -> ToolRegistry:
    """Build Ralph's default tools plus a few domain-specific demo helpers."""

    tool_registry = build_harness_tools(ctx)

    for tool in DEMO_TOOLS:
        tool_registry.register(tool)

    return tool_registry
