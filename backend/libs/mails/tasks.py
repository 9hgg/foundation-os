from uuid import UUID

import structlog
from sqlalchemy import func, text

from libs.db import context_db
from libs.tasks.models import Task
from libs.tasks.tasks_manager import TasksManager

from .config import MAILS_SETTINGS
from .models import Mail, MailAttempt, MailSettings
from .providers.smtp._generic import GenericSMTPProvider

MAX_EMAILS = 10
MAX_ATTEMPTS = 3
MINIMUM_BACKOFF_SECONDS = 5

logger = structlog.get_logger(__name__)


def exponential_backoff(attempt: int):
    if attempt == 0:
        return 0
    return 2**attempt + MINIMUM_BACKOFF_SECONDS


class MailIdRequiredException(Exception):
    def __init__(self):
        super().__init__("mail_id is required")


class MailSettingsNotFoundException(Exception):
    def __init__(self):
        super().__init__("Mail settings not found")


class MailNotFoundException(Exception):
    def __init__(self):
        super().__init__("Mail not found")


@TasksManager.enlist_task()
def send_email(**kwargs):
    task = kwargs.get("task")

    mail_id = kwargs.get("mail_id")
    if mail_id is None:
        raise MailIdRequiredException()

    TasksManager.set_task_progress(task, 5.0)

    mail_db = Mail.by_id(mail_id)
    if mail_db is None:
        logger.error("mail_not_found", mail_id=str(mail_id))
        raise MailNotFoundException()

    mail_settings = MailSettings.by_id(MAILS_SETTINGS.MAIL_SETTINGS_ID)
    if mail_settings is None:
        logger.error("mail_settings_not_found")
        # check if the mail settings is not the 00000000-0000-0000-0000-000000000000
        if MAILS_SETTINGS.MAIL_SETTINGS_ID == UUID(  # noqa: SIM300
            "00000000-0000-0000-0000-000000000000"
        ):
            logger.error("mail_settings_placeholder_configured")
        raise MailSettingsNotFoundException()

    TasksManager.set_task_progress(task, 20.0)

    mail_attempt = MailAttempt.create(
        obj_dict={
            "status": "sending",
            "mail_id": mail_id,
            "mail_settings_id": mail_settings.id,
        }
    )

    try:
        smtp_provider = GenericSMTPProvider(
            mail_settings=mail_settings,
        )

        logger.info("email_sending", provider=type(smtp_provider).__name__)

        TasksManager.set_task_progress(task, 40.0)

        smtp_provider.send_email_with_attachments(
            sender_email=mail_db.sender,
            recipient_emails=mail_db.recipients,
            subject=mail_db.subject,
            text_content=mail_db.body,
            html_content=mail_db.body_html,
            cc_emails=mail_db.config.cc,
            # headers=[],
            # dry_run=True,
        )

        TasksManager.set_task_progress(task, 90.0)

        Mail.patch(
            obj_id=mail_db.id,
            update_dict={
                "status": "sent",
            },
        )

        MailAttempt.patch(
            obj_id=mail_attempt.id,
            update_dict={
                "status": "sent",
            },
        )

        TasksManager.set_task_progress(task, 100.0)

    except Exception as e:
        logger.exception(
            "email_send_failed",
            mail_id=str(mail_db.id),
            error_type=type(e).__name__,
        )
        try:
            Mail.patch(
                obj_id=mail_db.id,
                update_dict={
                    "status": "failed",
                },
            )
        except Exception as e:
            logger.exception("mail_failure_status_update_failed", error_type=type(e).__name__)

        try:
            MailAttempt.patch(
                obj_id=mail_attempt.id,
                update_dict={
                    "status": "failed",
                    "error": str(e),
                },
            )
        except Exception as e:
            logger.exception("mail_attempt_failure_status_update_failed", error_type=type(e).__name__)


@TasksManager.enlist_task()
def process_emails(**kwargs):
    logger.debug("email_processing_started")

    ## Task "process_emails" => subtasks creation for each email with the status "pending" and "failed"
    #    - should update the status of the mail to "processing"
    #    - create the subtask custom id should be the mail id + the attempt id, this way we can be sure to process only
    # once a mail attempt
    #    - once the "process_emails" main part is done, it should check for anormal status (like "processing" for more than 1 hour)

    # 1 - Get all the emails with the status "pending" and "failed", up to 10 emails
    # Mail.

    with context_db() as db:
        # GET THE MAILS

        query = (
            db.query(Mail, func.count(MailAttempt.id).label("attempts_count"))
            .outerjoin(MailAttempt, Mail.id == MailAttempt.mail_id)
            .group_by(Mail.id)
            .order_by(  # type: ignore[attr-defined]
                Mail.priority.desc(),  # type: ignore[attr-defined]
                Mail.time_created.asc(),  # type: ignore[attr-defined]
            )
            # filter over the status
            .filter(Mail.status.in_(["pending", "failed"]))
            # filter over the attempts number column (we can't use the count function in the filter)
            .having(func.count(MailAttempt.id) < MAX_ATTEMPTS)
            .limit(10)
        )
        mails_and_attempts = query.all()

        for mail, attempts_count in mails_and_attempts:
            logger.debug("mail_processing", mail_id=str(mail.id))
            # TODO: if attempt count > MAX_ATTEMPTS, we should replace the mail by another one to the admin
            if attempts_count >= MAX_ATTEMPTS:
                logger.warning("mail_max_attempts_reached", mail_id=str(mail.id))
                continue

            # # 2 - Update the status of the mail to "processing"

            Mail.patch(obj_id=mail.id, update_dict={"status": "processing"}, _db=db)

            # TODO: we should use the number of
            # attemps to calculate the backoff and the custom_id
            Task.create(
                obj_dict={
                    "method_name": "send_email",
                    "arguments": {
                        "kwargs": {
                            "mail_id": mail.id,
                        }
                    },
                    "custom_id": f"{mail.id}-{attempts_count}",
                }
            )

            # # 3 - Create the subtask custom id should be the mail id + the attempt id, this way we can be sure to process only once a mail attempt
            # # 4 - Once the "process_emails" main part is done, it should check for anormal status (like "processing" for more than 1 hour)

        query_status_processing = (
            db.query(Mail)
            .filter(Mail.status == "processing")
            .filter(Mail.time_updated < func.now() - text("interval '1 minute'"))
        )
        mails_processing = query_status_processing.all()

        for mail in mails_processing:
            logger.warning("mail_processing_stale", mail_id=str(mail.id))
            Mail.patch(obj_id=mail.id, update_dict={"status": "failed"}, _db=db)
