import typing
from typing import Optional

from fastapi import Depends
from jose import jwt

from libs.users.config import USER_SETTINGS
from libs.utils import tokens

from .methods import get_current_user_optional
from .models import User

CurrentUser__dep = typing.Annotated[User | None, Depends(get_current_user_optional)]


async def get_current_user_from_ws_token(token: str) -> Optional[User]:
    """Get current user from WebSocket token."""
    try:

        payload = jwt.decode(
            token,
            USER_SETTINGS.APP_SECRET + "auth",
            algorithms=[tokens.TOKENS_SETTINGS.encoding_algorithm],
        )
        user_id = payload.get("sub")
        if user_id:
            return User.by_id(user_id)
    except Exception:
        import logging

        logging.exception("Failed to decode WebSocket token")
    return None
