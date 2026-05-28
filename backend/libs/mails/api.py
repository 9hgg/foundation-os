from typing import Optional

from fastapi import Body
from pydantic import BaseModel

from libs.endpoints import create_crud_endpoints
from libs.tasks.methods import launch_tasks_processing
from libs.tasks.models import Task
from libs.tasks.tasks_manager import TasksManager
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from . import models
from .methods import add_mail_to_db, get_admin_mail_overview
from .template_utils import render_transactional_email


class TemplateEmailRequest(BaseModel):
    """Request model for sending template-based emails"""

    from_addr: str
    to_addrs: list[str]
    subject: str
    title: Optional[str] = None
    subtitle: Optional[str] = None
    main_paragraph: Optional[str] = None
    button_text: Optional[str] = None
    button_url: Optional[str] = None
    additional_content: Optional[str] = None
    footer_message: Optional[str] = "This is a transactional email, there is no need to unsubscribe."


def create_crud_mail_router(prefix: str = "/api/mails"):
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
            title="send_email",
            custom_id=f"{mail.id}-0",
            method_name="send_email",
            description="Send email",
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
            title="send_email",
            custom_id=f"{mail.id}-0",
            method_name="send_email",
            description="Send template email",
            kwargs={
                "mail_id": mail.id,
            },
        )

        await launch_tasks_processing()

        return EndpointOutput(result=mail)

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
            title="send_email",
            description="Re-send email",
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
