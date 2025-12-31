import uuid
from textwrap import dedent

from libs.mails.providers.smtp.local import DEFAULT_LOCAL_SMTP

if __name__ == "__main__":
    # Example:

    from_addr = "Capitan Joris <joris+capitana@banana.army>"
    to_addrs = [
        "Samurai Joris <joris+samurai@banana.army>",
    ]

    subject = "test ses" + str(uuid.uuid4())
    text = "Some text"
    html = dedent(
        """\
        <html>
            <head></head>
            <body>
                <h1>Hi!</h1>
                <p>Some text</p>
            </body>
        </html>
        """
    )

    DEFAULT_LOCAL_SMTP.send_email_with_attachments(
        sender_email=from_addr,
        recipient_emails=to_addrs,
        subject=subject,
        text_content=text,
        html_content=html,
    )
