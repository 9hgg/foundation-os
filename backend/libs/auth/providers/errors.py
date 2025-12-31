class NoLDAPDataError(ValueError):
    """Raised when no LDAP data is provided to the provider."""

    def __init__(self):
        super().__init__("No LDAP data provided")


class InvalidLDAPDataError(ValueError):
    """Raised when provided LDAP data is invalid."""

    def __init__(self):
        super().__init__("Invalid LDAP data")


class EmailNotFoundError(ValueError):
    """Raised when email cannot be found in LDAP data."""

    def __init__(self):
        super().__init__("Email not found in LDAP data")


__all__ = [
    "EmailNotFoundError",
    "InvalidLDAPDataError",
    "NoLDAPDataError",
]
