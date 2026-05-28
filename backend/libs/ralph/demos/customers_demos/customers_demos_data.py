from .customers_demos_models import (
    DemoCustomer,
    DemoIncident,
    DemoInvoice,
    DemoPolicyNote,
    DemoSupportTicket,
)

CUSTOMERS = [
    DemoCustomer(
        customer_id="cust_100",
        name="Acme Robotics",
        email="ops@acmerobotics.example",
        segment="enterprise",
        tier="vip",
        renewal_risk="medium",
    ),
    DemoCustomer(
        customer_id="cust_101",
        name="Northwind Health",
        email="it@northwind-health.example",
        segment="mid_market",
        tier="standard",
        renewal_risk="high",
    ),
    DemoCustomer(
        customer_id="cust_102",
        name="Bluebird Retail",
        email="cto@bluebird-retail.example",
        segment="enterprise",
        tier="vip",
        renewal_risk="low",
    ),
]

INVOICES = [
    DemoInvoice(
        invoice_id="inv_001",
        customer_id="cust_100",
        amount_eur=12400.0,
        status="overdue",
        due_date="2026-04-08",
    ),
    DemoInvoice(
        invoice_id="inv_002",
        customer_id="cust_101",
        amount_eur=3800.0,
        status="overdue",
        due_date="2026-04-11",
    ),
    DemoInvoice(
        invoice_id="inv_003",
        customer_id="cust_102",
        amount_eur=9100.0,
        status="paid",
        due_date="2026-04-20",
    ),
]

TICKETS = [
    DemoSupportTicket(
        ticket_id="tick_900",
        customer_id="cust_100",
        severity="critical",
        topic="checkout_api",
        summary="Checkout API returns 500s during burst traffic after the latest release.",
        status="open",
    ),
    DemoSupportTicket(
        ticket_id="tick_901",
        customer_id="cust_100",
        severity="medium",
        topic="invoice_portal",
        summary="Finance team cannot download PDF invoices for March from the portal.",
        status="investigating",
    ),
    DemoSupportTicket(
        ticket_id="tick_902",
        customer_id="cust_101",
        severity="high",
        topic="sso_login",
        summary="SSO login fails for clinical supervisors after role sync.",
        status="open",
    ),
]

POLICIES = [
    DemoPolicyNote(
        topic="refunds",
        guidance="Refunds above 10,000 EUR require finance approval and a clear customer impact note.",
        owner_team="finance_ops",
    ),
    DemoPolicyNote(
        topic="vip_support",
        guidance="VIP customers with critical incidents should receive an owner update within 30 minutes.",
        owner_team="customer_success",
    ),
    DemoPolicyNote(
        topic="security_incidents",
        guidance="Potential auth or SSO regressions must be escalated to platform security immediately.",
        owner_team="security",
    ),
]

INCIDENTS = [
    DemoIncident(
        incident_id="inc_41",
        service="checkout_api",
        impact="Failed payments for 7 percent of sessions in EU West.",
        suspected_root_cause="Connection pool exhaustion after a retry policy change.",
        next_action="Roll back the retry policy and monitor error rate.",
    ),
    DemoIncident(
        incident_id="inc_42",
        service="identity_sync",
        impact="Delayed role updates for newly promoted supervisors.",
        suspected_root_cause="Background worker backlog after a schema migration.",
        next_action="Drain the backlog and re-run failed sync jobs.",
    ),
]
