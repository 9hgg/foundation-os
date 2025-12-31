class MissingSMTPCipherKeyError(Exception):
    def __init__(self):
        super().__init__("Cipher key for SMTP is not set in settings")


class SMTPConnectionNotCreatedError(Exception):
    def __init__(self):
        super().__init__("SMTP connection not created")


class SMTPTextContainsHTMLTagError(Exception):
    def __init__(self):
        super().__init__("Text content provided but HTML tag found")


class SMTPHTMLContentMissingTagError(Exception):
    def __init__(self):
        super().__init__("HTML content provided but no HTML tag found")


__all__ = [
    "MissingSMTPCipherKeyError",
    "SMTPConnectionNotCreatedError",
    "SMTPHTMLContentMissingTagError",
    "SMTPTextContainsHTMLTagError",
]
