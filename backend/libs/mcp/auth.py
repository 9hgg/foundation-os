"""
MCP Authentication helpers.

Provides a lightweight, token-based user resolution function suitable for use
inside MCP tool functions where FastAPI dependency injection is not available.
"""

from jose import jwt
from jose.exceptions import JWTError
from pydantic import ValidationError

from libs.users.config import USER_SETTINGS
from libs.users.models import User
from libs.utils import tokens


def get_user_from_token(auth_token: str | None) -> User | None:
    """
    Resolve a JWT bearer token string to a User database row.

    Args:
        auth_token: The raw JWT string (without the "Bearer " prefix).

    Returns:
        The matching User, or None if the token is absent, invalid, or the
        user cannot be found.
    """
    if not auth_token:
        return None

    try:
        payload = jwt.decode(
            auth_token,
            USER_SETTINGS.APP_SECRET + "auth",
            algorithms=[tokens.TOKENS_SETTINGS.encoding_algorithm],
        )
    except (JWTError, ValidationError):
        return None

    sub = payload.get("sub")
    if not sub:
        return None

    try:
        return User.by_id(sub)
    except Exception:
        return None
