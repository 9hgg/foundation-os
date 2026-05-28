from collections import defaultdict
from uuid import UUID

from libs.db import context_db
from libs.mails.models import Mail

from .config import MAILS_SETTINGS
from .models import (
    AdminMailAttemptSummary,
    AdminMailOverview,
    AdminMailSettingsSummary,
    AdminMailSummary,
    MailAttempt,
    MailSettings,
)


def add_mail_to_db(
    sender_email: str,
    recipient_emails: list[str],
    subject: str,
    text_content: str,
    html_content: str = None,
    priority: int = 0,
    # pending, processing, sent, failed, replaced, unknown
    status: str = "pending",
):
    mail = Mail.create(
        obj_dict={
            "status": status,
            "subject": subject,
            "body": text_content,
            "body_html": html_content,
            "sender": sender_email,
            "priority": priority,
            "recipients": recipient_emails,
        }
    )

    print("Mail added to the database", mail.subject, mail.recipients)

    return mail


def get_admin_mail_overview(limit: int = 100) -> AdminMailOverview:
    with context_db() as db:
        recent_mails = (
            db.query(Mail)
            .order_by(Mail.time_created.desc())  # type: ignore[attr-defined]
            .limit(limit)
            .all()
        )
        recent_mail_ids = [mail.id for mail in recent_mails]

        mail_settings = (
            db.query(MailSettings)
            .order_by(MailSettings.name.asc())  # type: ignore[attr-defined]
            .all()
        )
        mail_settings_by_id = {
            mail_settings_row.id: mail_settings_row for mail_settings_row in mail_settings
        }

        attempts_by_mail_id: dict[UUID, list[AdminMailAttemptSummary]] = defaultdict(list)
        if recent_mail_ids:
            mail_attempts = (
                db.query(MailAttempt)
                .filter(MailAttempt.mail_id.in_(recent_mail_ids))
                .order_by(MailAttempt.time_created.desc())  # type: ignore[attr-defined]
                .all()
            )
            for mail_attempt in mail_attempts:
                mail_settings_row = mail_settings_by_id.get(mail_attempt.mail_settings_id)
                attempts_by_mail_id[mail_attempt.mail_id].append(
                    AdminMailAttemptSummary(
                        id=mail_attempt.id,
                        time_created=mail_attempt.time_created,
                        time_updated=mail_attempt.time_updated,
                        status=mail_attempt.status,
                        error=mail_attempt.error,
                        mail_id=mail_attempt.mail_id,
                        mail_settings_id=mail_attempt.mail_settings_id,
                        mail_settings_name=mail_settings_row.name if mail_settings_row else None,
                        mail_settings_kind=mail_settings_row.kind if mail_settings_row else None,
                    )
                )

    return AdminMailOverview(
        mail_settings=[
            AdminMailSettingsSummary(
                id=mail_settings_row.id,
                name=mail_settings_row.name,
                kind=mail_settings_row.kind,
                is_active=mail_settings_row.id == MAILS_SETTINGS.MAIL_SETTINGS_ID,
            )
            for mail_settings_row in mail_settings
        ],
        mails=[
            AdminMailSummary(
                id=mail.id,
                time_created=mail.time_created,
                time_updated=mail.time_updated,
                status=mail.status,
                subject=mail.subject,
                body=mail.body,
                body_html=mail.body_html,
                sender=mail.sender,
                priority=mail.priority,
                recipients=list(mail.recipients),
                attempts=attempts_by_mail_id[mail.id],
                attempts_count=len(attempts_by_mail_id[mail.id]),
            )
            for mail in recent_mails
        ],
    )
