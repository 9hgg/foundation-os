import smtpd
import smtplib


class CustomSMTPServer(smtpd.SMTPServer):
    async def process_message(self, peer, mailfrom, rcpttos, data, **kwargs):
        try:
            with smtplib.SMTP("your_relay_host", 25) as server:
                response = server.sendmail(mailfrom, rcpttos, data)

                print(f"Message sent from {mailfrom} to {', '.join(rcpttos)}")
                return response
        except smtplib.SMTPResponseException as e:
            print(f"Error processing message: {e.smtp_code} {e.smtp_error}")

            if 500 <= e.smtp_code <= 599:
                # Permanent failure (bounce)
                self.handle_bounce(mailfrom, rcpttos, e.smtp_code, e.smtp_error)
            elif 400 <= e.smtp_code <= 499:
                # Temporary failure (rejection or greylisting)
                self.handle_temporary_failure(
                    mailfrom, rcpttos, e.smtp_code, e.smtp_error
                )

            return e.smtp_code

    def handle_bounce(self, mailfrom, rcpttos, smtp_code, smtp_error):
        # Placeholder: handle bounce
        print(
            f"Handling bounce for {mailfrom} to {', '.join(rcpttos)}: {smtp_code} {smtp_error}"
        )
        # Update your database, mark email addresses as invalid, etc.

    def handle_temporary_failure(self, mailfrom, rcpttos, smtp_code, smtp_error):
        # Placeholder: handle temporary failure (rejection or greylisting)
        print(
            f"Handling temporary failure for {mailfrom} to {', '.join(rcpttos)}: {smtp_code} {smtp_error}"
        )
        # Implement a retry mechanism, log the errors, etc.


def send_email(subject, body, to_email, from_email):
    message = (
        f"Subject: {subject}\r\nFrom: {from_email}\r\nTo: {to_email}\r\n\r\n{body}"
    )

    try:
        with smtplib.SMTP("your_customer_smtp_server", 25) as server:
            server.sendmail(from_email, to_email, message)
        print(f"Email sent from {from_email} to {to_email}")
        return True
    except Exception as e:
        print(f"Failed to send email from {from_email} to {to_email}: {e}")
        return False


if __name__ == "__main__":
    send_email(
        "Hello",
        "This is a test email",
        "recipient@example.com",
        "user@customerdomain.com",
    )
