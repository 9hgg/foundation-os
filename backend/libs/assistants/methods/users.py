from typing import Any

import structlog

from libs.assistants.constants import _AI_RESPONSE_KIND, _AUTH_TOKEN_CONTEXT_KEY
from libs.messages.models import Message
from libs.utils import tokens

logger = structlog.get_logger(__name__)


def get_auth_token_for_user(user_id: Any) -> str:
    """Mint a short-lived JWT for *user_id* to authenticate MCP tool calls."""
    return tokens.create_jwt_token(
        token_context_key=_AUTH_TOKEN_CONTEXT_KEY,
        subject=str(user_id),
    )


def _resolve_auth_token(non_thinking_messsages: list[Message], user_id: str | None) -> str | None:
    """Mint a JWT for the triggering user or the last human message author."""
    resolved_user_id = user_id
    if not resolved_user_id:
        last_human_message = next((m for m in reversed(non_thinking_messsages) if m.kind != _AI_RESPONSE_KIND), None)
        if last_human_message and last_human_message.author_id:
            resolved_user_id = str(last_human_message.author_id)
    if not resolved_user_id:
        return None
    try:
        token = get_auth_token_for_user(resolved_user_id)
        logger.info("assistant_auth_token_minted", user_id=resolved_user_id)
    except Exception as exc:
        logger.warning(
            "assistant_auth_token_mint_failed",
            user_id=resolved_user_id,
            error=str(exc),
        )
        return None
    else:
        return token
