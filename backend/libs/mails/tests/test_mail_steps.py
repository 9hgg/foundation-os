import uuid
from textwrap import dedent

from libs.tasks.models import Task

from ..methods import add_mail_to_db

if __name__ == "__main__":
    # Example:

    from_addr = "Capitan Joris <joris+capitana@banana.army>"
    to_addrs = [
        "Samurai Joris <joris+samurai@banana.army>",
    ]

    subject = "test ses " + str(uuid.uuid4())
    text = "Some text"
    html = dedent(
        """
        <html>
            <head></head>
            <body>
                <h1>Hi!</h1>
                <p>Some <b>bold text</b></p>
            </body>
        </html>
        """
    )

    # Create a mail object "pending" and add it to the database
    mail = add_mail_to_db(
        priority=1,
        sender_email=from_addr,
        recipient_emails=to_addrs,
        subject=subject,
        text_content=text,
        html_content=html,
    )

    # register the task in the DB
    Task.create(
        obj_dict={
            "method_name": "process_emails",
        }
    )

    # TODO once the "process_emails" main part is done, it should check for anormal status (like "processing" for more than 1 hour)
