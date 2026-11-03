"""The one mail this lib sends: you have been invited, here is the link."""

from textwrap import dedent

import structlog

from libs.mails.methods import add_mail_to_db, mail_task_description
from libs.mails.template_utils import render_transactional_email
from libs.tasks.methods import run_task_here
from libs.tasks.tasks_manager import TasksManager
from libs.teams.config import TEAM_SETTINGS
from libs.teams.invitations import link_token

logger = structlog.get_logger(__name__)


def send_invitation_email(
    *,
    recipient_email: str,
    team_id,
    team_name: str | None,
    role: str,
    token: str,
    invited_by_name: str | None,
    frontend_url: str,
    translator,
) -> None:
    """Queue the invitation and run it here.

    Sent inline rather than left for the worker, like the password reset it is modelled on: the
    person who clicked "invite" is watching, and an invitation that arrives ten minutes later
    reads as one that did not arrive.
    """
    join_url = f"{frontend_url}/host/teams/join?token={link_token(team_id, token)}"

    team_label = team_name or translator.translate("a team")
    subject = " ".join([translator.translate("You have been invited to join"), team_label])
    invited_by_sentence = (
        " ".join([invited_by_name, translator.translate("invited you to join")])
        if invited_by_name
        else translator.translate("You have been invited to join")
    )
    main_paragraph = " ".join(
        [
            invited_by_sentence,
            f"{team_label},",
            translator.translate("as"),
            f"{translator.translate(role)}.",
            translator.translate("Follow the link below to accept."),
            translator.translate("If you do not have an account yet you will be invited to create one first."),
        ]
    )

    text_content = dedent(
        f"""
        {subject}

        To join {team_label}, visit: {join_url}

        This invitation expires in 7 days.

        If you were not expecting this, you can ignore this email.

        ---
        The {TEAM_SETTINGS.APP_NAME or ""} team
        """
    ).strip()

    html_content = render_transactional_email(
        title=subject,
        subtitle=translator.translate("You have been invited to join a team."),
        main_paragraph=main_paragraph,
        button_text=translator.translate("Join the team"),
        button_url=join_url,
        footer_message=translator.translate(
            "This invitation expires in 7 days."
            " If you were not expecting it, you can ignore this email."
        ),
        origin=frontend_url,
    )

    mail = add_mail_to_db(
        sender_email=TEAM_SETTINGS.SENDER_EMAIL,
        recipient_emails=[recipient_email],
        subject=subject,
        text_content=text_content,
        html_content=html_content,
        priority=1,
    )
    task = TasksManager.create_task(
        title="Send team invitation email",
        custom_id=f"{mail.id}-0",
        method_name="send_email",
        description=mail_task_description(mail),
        kwargs={"mail_id": mail.id},
    )
    logger.info("team_invitation_email_queued", team_id=str(team_id))
    run_task_here(task.id)
