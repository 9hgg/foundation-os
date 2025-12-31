
from fastapi import Request
from jose import jwt
from jose.exceptions import JWEError

import libs.utils.crypto
import libs.utils.emails
import libs.utils.tokens
from libs.db import context_db
from libs.i18n.methods import SimpleTranslator
from libs.logger import print
from libs.users.config import USER_SETTINGS
from libs.users.models import User
from libs.utils.types import EndpointError, EndpointOutput

from . import models
from .constants import RESET_PASSWORD_CONTEXT_KEY


def action_user_reset_password(
    request: Request | None,
    action_key: str,
    current_user: type["User"] | None,
    kv: dict,
    translator: SimpleTranslator,
):
    user_email: str | None = kv.get("email")  # type: ignore
    if user_email is None:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate(
                    "Missing email.",
                ),
                code="missing_email",
            )
        )

    user_email: str = user_email.lower()

    user_db = models.User.get_first_by(
        email=user_email,
    )

    if user_db is None:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate(
                    "User not found with email §user_email.",
                    kv={"user_email": user_email},
                ),
                code="user_not_found",
            )
        )
    # create a token
    token = libs.utils.tokens.create_jwt_token(token_context_key=RESET_PASSWORD_CONTEXT_KEY, subject=user_db.id)
    # # create a link (should use the origin of the request)
    # hostname = None
    # if request:
    #     hostname = request.base_url.hostname
    # # TODO: implement default hostname fallback

    # if hostname is None:
    #     return EndpointOutput(
    #         error=EndpointError(
    #             title=translator.translate("Missing hostname.", ),
    #             code="missing_hostname",
    #         )
    #     )

    origin = kv.get("origin")
    if origin is None:
        request_origin = request.url.__str__() if request else None
        from_header_origin = request.headers.get("ba-origin", None) if request else None
        origin = from_header_origin if from_header_origin else request_origin
    if origin is None:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate(
                    "Impossible to determine the origin.",
                ),
                code="missing_origin",
            )
        )

    # extract scheme hostname and port from origin (everything before the first /)
    origin_scheme = origin.split("://")[0]
    origin_hostname = origin.split("://")[1].split("/")[0]
    hostname = f"{origin_scheme}://{origin_hostname}"

    reset_password_link = (
        # f"{hostname}/api/actions/user.reset-password-claim/execute?token={token}"
        f"{hostname}/api/users/password/claim-reset-token/{token}"
    )
    if reset_password_link.startswith("https://local"):
        reset_password_link = reset_password_link.replace("https://local", "http://local")

    print("reset_password_link", reset_password_link)
    print("token", token)
    print("user_db", user_db)

    # link DB

    # create a dict for a template

    # send the email
    # create the endpoint to reset the password

    if user_db is None:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate(
                    "User not found with email §user_email.",
                    kv={"user_email": user_email},
                ),
                code="user_not_found",
            )
        )

    return EndpointOutput(result={})


def action_user_reset_password_claim(
    request: Request | None,
    action_key: str,
    current_user: type["User"] | None,
    kv: dict,
    translator: SimpleTranslator,
):
    token = kv.get("token")
    if token is None:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate(
                    "Missing token.",
                ),
                code="missing_token",
            )
        )

    try:
        # print("[users.methods.py](get_current_user_optional) authToken:", authToken)
        token_payload = jwt.decode(
            token,
            USER_SETTINGS.APP_SECRET + RESET_PASSWORD_CONTEXT_KEY,
            algorithms=[libs.utils.tokens.TOKENS_SETTINGS.encoding_algorithm],
        )
    except JWEError as e:  # type: ignore
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate(
                    "Invalid token.",
                ),
                code="invalid_token",
                details={
                    "exception": e.__str__(),
                },
            )
        )

    # check the token
    if token_payload is None:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate(
                    "Invalid token.",
                ),
                code="invalid_token",
            )
        )

    user_id = token_payload.get("sub", None)
    if user_id is None:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate(
                    "Invalid token.",
                ),
                code="invalid_token",
            )
        )

    # get the user
    user_db = models.User.by_id(user_id)
    if user_db is None:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate(
                    "User not found.",
                ),
                code="user_not_found",
            )
        )

    print("user_db", user_db)

    password = kv.get("password")
    if password is None:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate(
                    "Missing password.",
                ),
                code="missing_password",
            )
        )

    password_hashed = None
    if len(password) < 5:
        return EndpointOutput(
            error=EndpointError(
                title=translator.translate("Password too short. You need at least 5 characters"),
                code="password_too_short",
            )
        )

    password_hashed = libs.utils.crypto.hash_secret(password)

    user_db.password_hashed = password_hashed
    with context_db() as db:
        db.add(user_db)
        db.commit()

    return EndpointOutput(result={})
