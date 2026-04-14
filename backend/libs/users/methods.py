import cachetools
import fastapi
from fastapi import Depends, Request
from fastapi.security import OAuth2
from fastapi.security.utils import get_authorization_scheme_param
from jose import jwt
from jose.exceptions import JWTError
from pydantic import ValidationError

from libs.users.config import USER_SETTINGS
from libs.utils import tokens

from .models import User


class CustomOAuth2PasswordBearerCookie(OAuth2):
    def __init__(self):
        flows = fastapi.openapi.models.OAuthFlows(  # type: ignore
            password={"tokenUrl": "/api/users/auth/oauth2", "scopes": {}}
        )
        super().__init__(flows=flows)

    async def __call__(self, request: Request) -> str | None:
        header_authorization = request.headers.get("Authorization")
        cookie_authorization = request.cookies.get("Authorization")

        header_scheme, header_param = get_authorization_scheme_param(
            header_authorization
        )
        cookie_scheme, cookie_param = get_authorization_scheme_param(
            cookie_authorization
        )

        param = None
        scheme = None

        if header_scheme.lower() == "bearer":
            authorization = True
            param = header_param
            scheme = header_scheme
        elif cookie_scheme.lower() == "bearer":
            authorization = True
            param = cookie_param
            scheme = cookie_scheme
        else:
            authorization = False

        if not scheme or not param:
            return None

        if not authorization or scheme.lower() != "bearer":
            return None
        return param


reusable_oauth2_optional = CustomOAuth2PasswordBearerCookie()


# Create a TTLCache, e.g., up to 1024 entries, each expiring after 120 seconds.
USER_CACHE: cachetools.TTLCache = cachetools.TTLCache(maxsize=1024, ttl=120)


def get_current_user_optional(
    authToken: str | None = Depends(reusable_oauth2_optional),
) -> User | None:
    """Get the current user from the token.
    - If the token is not present, return None.
    - If the token is invalid, return None.
    - If the user is not found, return None.

    Args:
        authToken (str | None, optional): The token to check. Defaults to Depends(reusable_oauth2_optional).

    Returns:
        User | None: The user if found, else None.
    """
    if not authToken:
        return None

    try:
        payload = jwt.decode(
            authToken,
            USER_SETTINGS.APP_SECRET + "auth",
            algorithms=[tokens.TOKENS_SETTINGS.encoding_algorithm],
        )
    except (JWTError, ValidationError):
        return None

    # Check the cache first
    user = USER_CACHE.get(authToken)
    if user:
        return user

    sub = payload.get("sub", None)
    if sub is None:
        return None
    user_db: User | None = User.by_id(sub)
    if user_db:
        # Store the user in the cache
        USER_CACHE[authToken] = user_db
    return user_db


def _get_user_display_info(user_id: str) -> tuple[str, str]:
    """
    Get user display information (pseudonym and starred email) for notifications.

    Args:
        user_id: The user ID to look up

    Returns:
        Tuple of (display_name, starred_email)
    """
    try:
        user_db = User.by_id(user_id)
        if user_db is None:
            return "Unknown user", ""

        # Use pseudonym if available, otherwise fall back to email prefix
        display_name = user_db.pseudo
        if not display_name:
            display_name = (
                user_db.email.split("@")[0] if user_db.email else "Unknown user"
            )

        # Create starred email
        starred_email = ""
        if user_db.email and len(user_db.email.split("@")[0]) > 2:
            # Replace all characters except the first and last with *
            # e.g. if email is "john.doe@example.com", it becomes "j***e@example.com"
            email_parts = user_db.email.split("@")
            local_part = email_parts[0]
            domain = email_parts[1]
            starred_email = (
                local_part[0] + "***" + local_part[-1] + "@" + domain[0] + "***"
            )
        else:
            starred_email = user_db.email or ""

    except Exception as e:
        print(f"[_get_user_display_info] Error fetching user info for {user_id}: {e}")
        return "Unknown user", ""
    else:
        return display_name, starred_email
