from libs.mails.models import Mail


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
