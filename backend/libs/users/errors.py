class UserNotCreatedError(ValueError):
    """Raised when user creation unexpectedly fails."""

    def __init__(self):
        super().__init__("User not created")
