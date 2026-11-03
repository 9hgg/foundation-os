
from fastapi import APIRouter, Body, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel

from libs.endpoints import create_crud_endpoints
from libs.tasks.methods import launch_tasks_processing, run_task_here
from libs.tasks.models import Task
from libs.tasks.tasks_manager import TasksManager
from libs.users.config import USER_SETTINGS
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from . import models
from .methods import (
    RESEND_COOLDOWN,
    add_mail_to_db,
    build_verification_key,
    build_verification_link,
    claim_token,
    get_admin_mail_overview,
    get_verification,
    mail_task_description,
    mint_verification,
    normalize_email,
    seconds_before_resend,
)
from .template_utils import render_email_template, render_transactional_email

# Temporary shared secret for Rumble Studio's server-to-server calls, while its own
# Mailjet integration is dead and its app is being sunset (~2026-08-31). Remove this
# endpoint and secret once Rumble Studio is fully retired.
RUMBLE_STUDIO_MAIL_SECRET = "rmbl-stdio-2026-9f3a7c1e5b8d4021"  # noqa: S105


class TemplateEmailRequest(BaseModel):
    """Request model for sending template-based emails"""

    from_addr: str
    to_addrs: list[str]
    subject: str
    title: str | None = None
    subtitle: str | None = None
    main_paragraph: str | None = None
    button_text: str | None = None
    button_url: str | None = None
    additional_content: str | None = None
    footer_message: str | None = "This is a transactional email, there is no need to unsubscribe."


def create_crud_mail_router(prefix: str = "/api/mails"):  # noqa: C901
    crud_mail_router = create_crud_endpoints(models.Mail, prefix=prefix, tags=["mails"])

    @crud_mail_router.post("/send/one")
    async def send_email(
        classic_deps: ClassicDeps__dep,
        from_addr: str = Body(...),
        to_addrs: list[str] = Body(...),
        subject: str = Body(...),
        text: str = Body(...),
        html: str = Body(None),
    ):
        current_user_db, session, translator = classic_deps

        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authenticated"),
                    description=translator.translate("You need to be authenticated to send an email"),
                    code="not_authenticated",
                )
            )

        mail = add_mail_to_db(
            priority=1,
            sender_email=from_addr,
            recipient_emails=to_addrs,
            subject=subject,
            text_content=text,
            html_content=html,
        )

        TasksManager.create_task(
            title="Send email",
            custom_id=f"{mail.id}-0",
            method_name="send_email",
            description=mail_task_description(mail),
            # args=[mail],
            kwargs={
                "mail_id": mail.id,
            },
        )

        await launch_tasks_processing()

        return EndpointOutput(result=mail)

    @crud_mail_router.post("/send/template")
    async def send_template_email(classic_deps: ClassicDeps__dep, request: TemplateEmailRequest):
        """Send an email using the transactional email template"""
        current_user_db, session, translator = classic_deps

        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authenticated"),
                    description=translator.translate("You need to be authenticated to send an email"),
                    code="not_authenticated",
                )
            )

        # Render the HTML content using the template
        html_content = render_transactional_email(
            title=request.title,
            subtitle=request.subtitle,
            main_paragraph=request.main_paragraph,
            button_text=request.button_text,
            button_url=request.button_url,
            additional_content=request.additional_content,
            footer_message=request.footer_message,
        )

        # Generate plain text content from the main components
        text_parts = []
        if request.title:
            text_parts.append(request.title)
        if request.subtitle:
            text_parts.append(request.subtitle)
        if request.main_paragraph:
            text_parts.append(request.main_paragraph)
        if request.button_text and request.button_url:
            text_parts.append(f"{request.button_text}: {request.button_url}")
        if request.additional_content:
            text_parts.append(request.additional_content)
        if request.footer_message:
            text_parts.append(request.footer_message)

        text_content = "\n\n".join(text_parts)

        mail = add_mail_to_db(
            priority=1,
            sender_email=request.from_addr,
            recipient_emails=request.to_addrs,
            subject=request.subject,
            text_content=text_content,
            html_content=html_content,
        )

        TasksManager.create_task(
            title="Send template email",
            custom_id=f"{mail.id}-0",
            method_name="send_email",
            description=mail_task_description(mail),
            kwargs={
                "mail_id": mail.id,
            },
        )

        await launch_tasks_processing()

        return EndpointOutput(result=mail)

    @crud_mail_router.post("/rumble-studio/send-transactional")
    async def send_rumble_studio_transactional_email(
        x_rumble_secret: str = Header(...),
        from_addr: str = Body(...),
        to_addr: str = Body(...),
        subject: str = Body(...),
        title: str = Body(...),
        body: str = Body(...),
        link: str | None = Body(None),
        action: str | None = Body(None),
        bottom: str | None = Body(None),
    ):
        """Send-transactional shim for Rumble Studio, whose own Mailjet integration is
        dead -- Rumble Studio's backend calls this instead of Mailjet directly, and
        spOken's own (SES-backed) mail pipeline delivers the email. Temporary, remove
        once Rumble Studio is retired."""
        if x_rumble_secret != RUMBLE_STUDIO_MAIL_SECRET:
            raise HTTPException(status_code=401, detail="Invalid secret")

        html_content = render_email_template(
            "transactional_rumble_studio.html",
            title=title,
            body=body,
            action=action,
            link=link,
            bottom=bottom,
        )
        text_parts = [title, body]
        if action and link:
            text_parts.append(f"{action}: {link}")
        if bottom:
            text_parts.append(bottom)
        text_content = "\n\n".join(text_parts)

        mail = add_mail_to_db(
            priority=1,
            sender_email=from_addr,
            recipient_emails=[to_addr],
            subject=subject,
            text_content=text_content,
            html_content=html_content,
        )

        TasksManager.create_task(
            title="Send Rumble Studio transactional email",
            custom_id=f"{mail.id}-0",
            method_name="send_email",
            description=mail_task_description(mail),
            kwargs={
                "mail_id": mail.id,
            },
        )

        await launch_tasks_processing()

        return {"success": True, "mail_id": str(mail.id)}

    @crud_mail_router.get("/process/not-sent")
    async def process_pending_emails():
        Task.create(
            obj_dict={
                "method_name": "process_emails",
            }
        )

        await launch_tasks_processing()

        return EndpointOutput(result="Processing emails")

    @crud_mail_router.get("/admin/overview")
    async def admin_get_mail_overview(
        classic_deps: ClassicDeps__dep,
    ) -> EndpointOutput[models.AdminMailOverview]:
        current_user_db, _, translator = classic_deps

        if not current_user_db or not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authorized"),
                    code="not_authorized",
                )
            )

        return EndpointOutput(result=get_admin_mail_overview())

    @crud_mail_router.post("/admin/{mail_id}/resend")
    async def admin_resend_mail(
        mail_id: str,
        classic_deps: ClassicDeps__dep,
    ) -> EndpointOutput[dict[str, str]]:
        current_user_db, _, translator = classic_deps

        if not current_user_db or not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authorized"),
                    code="not_authorized",
                )
            )

        try:
            mail_db = models.Mail.by_id(mail_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invalid mail ID"),
                    code="invalid_mail_id",
                )
            )

        if mail_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Mail not found"),
                    code="mail_not_found",
                )
            )

        models.Mail.patch(obj_id=mail_db.id, update_dict={"status": "pending"})
        TasksManager.create_task(
            method_name="send_email",
            title="Re-send email",
            description=mail_task_description(mail_db),
            kwargs={
                "mail_id": mail_db.id,
            },
        )

        await launch_tasks_processing()

        return EndpointOutput(
            result={"message": translator.translate("Email resend launched")}
        )

    # RETURN THE ROUTER
    return crud_mail_router


def create_email_verifications_router(prefix: str = "/api/email-verifications"):  # noqa: C901
    """Prove that someone holds an address, for one named occasion.

    Every route here is reachable without an account on purpose: the people proving an address are
    form respondents, who never sign in. What protects it is that nothing is disclosed (the status
    route answers a yes/no about a pair the caller already knows) and that sending is rate limited
    per (email, key).
    """
    router = APIRouter(tags=["email verifications"])

    @router.post(prefix + "/request")
    def request_verification(data: dict, request: Request) -> EndpointOutput[dict]:
        email = normalize_email(str(data.get("email") or ""))
        interaction_id = str(data.get("interactionId") or data.get("interaction_id") or "")
        step_id = str(data.get("stepId") or data.get("step_id") or "")
        redirect_url = data.get("redirectUrl") or data.get("redirect_url")

        if not email or "@" not in email:
            return EndpointOutput(error=EndpointError(title="Bad request", description="A valid email is required", code="bad_request"))
        if not interaction_id or not step_id:
            return EndpointOutput(
                error=EndpointError(title="Bad request", description="interactionId and stepId are required", code="bad_request")
            )

        key = build_verification_key(interaction_id, step_id)

        existing = get_verification(email, key)
        if existing and existing.verified:
            return EndpointOutput(result={"sent": False, "verified": True, "secondsBeforeResend": 0})

        wait = seconds_before_resend(existing)
        if wait > 0:
            # Not an error: the caller asked again too early, and the previous mail is still valid.
            return EndpointOutput(result={"sent": False, "verified": False, "secondsBeforeResend": wait})

        verification = mint_verification(email, key, redirect_url=redirect_url)

        verify_url = build_verification_link(verification.token, prefix, str(request.base_url))
        origin = request.headers.get("origin")
        subject = "Confirm your email address"
        html_content = render_transactional_email(
            title=subject,
            subtitle="One click and you're done.",
            main_paragraph=(
                "Someone (probably you) entered this address while filling in a form. "
                "Confirm it with the button below, then go back to the form."
            ),
            button_text="Confirm this address",
            button_url=verify_url,
            additional_content="If you did not fill in a form, you can ignore this email.",
            origin=origin,
        )
        text_content = (
            "Confirm your email address\n\n"
            "Someone (probably you) entered this address while filling in a form.\n"
            f"Open this link to confirm it, then go back to the form:\n{verify_url}\n\n"
            "If you did not fill in a form, you can ignore this email.\n"
        )

        mail = add_mail_to_db(
            sender_email=USER_SETTINGS.SENDER_EMAIL,
            recipient_emails=[email],
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            priority=2,
        )
        task = TasksManager.create_task(
            title="Send email",
            custom_id=f"{mail.id}-0",
            method_name="send_email",
            description=mail_task_description(mail),
            kwargs={"mail_id": mail.id},
        )
        # Someone is staring at "check your inbox" right now: run it here rather than waiting for
        # a worker container to start. Still a tracked task, just executed in this process.
        run_task_here(task.id)

        return EndpointOutput(result={"sent": True, "verified": False, "secondsBeforeResend": int(RESEND_COOLDOWN.total_seconds())})

    @router.get(prefix + "/verify/{token}")
    def verify(token: str):
        """The link inside the email. Returns a page, or a redirect when the caller asked for one."""
        verification = claim_token(token)

        if verification is None:
            return HTMLResponse(
                status_code=404,
                content=(
                    "<html><body style='font-family:sans-serif;text-align:center;padding:4rem'>"
                    "<h1>This link has expired</h1>"
                    "<p>Go back to the form and ask for a new confirmation email.</p>"
                    "</body></html>"
                ),
            )

        if verification.redirect_url:
            return RedirectResponse(verification.redirect_url, status_code=302)

        return HTMLResponse(
            content=(
                "<html><body style='font-family:sans-serif;text-align:center;padding:4rem'>"
                "<h1>Address confirmed</h1>"
                "<p>You can close this tab and go back to the form.</p>"
                "</body></html>"
            )
        )

    @router.post(prefix + "/status")
    def status(data: dict) -> EndpointOutput[dict]:
        email = normalize_email(str(data.get("email") or ""))
        interaction_id = str(data.get("interactionId") or data.get("interaction_id") or "")
        step_id = str(data.get("stepId") or data.get("step_id") or "")

        if not email or not interaction_id or not step_id:
            return EndpointOutput(
                error=EndpointError(title="Bad request", description="email, interactionId and stepId are required", code="bad_request")
            )

        verification = get_verification(email, build_verification_key(interaction_id, step_id))
        return EndpointOutput(
            result={
                "requested": verification is not None,
                "verified": bool(verification and verification.verified),
                "secondsBeforeResend": seconds_before_resend(verification),
            }
        )

    return router
