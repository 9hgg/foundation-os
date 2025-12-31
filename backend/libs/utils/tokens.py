from datetime import datetime, timedelta, timezone
from typing import Any, Optional, Union

from jose import jwt

from .config import TOKENS_SETTINGS


def create_jwt_token(
    token_context_key: str,
    subject: Union[str, Any],
    expires_delta: Optional[timedelta] = None,
    extra_data_to_encode: Optional[dict] = None,
) -> str:
    """
    Create a JSON Web Token (JWT) with the given parameters.

    Args:
        `token_context_key` (str): A key to be appended to the secret for encoding the JWT.
        `subject` (Union[str, Any]): The subject of the JWT, typically representing the user or entity that the token is about.
        `expires_delta` (Optional[timedelta], optional): The time duration after which the token will expire. Defaults to None.
        `extra_data_to_encode` (dict, optional): Additional data to include in the JWT payload. Defaults to an empty dictionary.
    Returns:
        str: The encoded JWT as a string.
    """

    at = datetime.now(timezone.utc)
    if expires_delta:
        expire = at + expires_delta
    else:
        expire = at + timedelta(minutes=TOKENS_SETTINGS.ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {
        #
        # iss (Issuer): Indicates the entity that issued the JWT. It can be a URL or a string identifying the issuer.
        # aud (Audience): Specifies the intended audience for the JWT. It can be a URL or a string identifying the recipient or recipients.
        # exp (Expiration Time): Specifies the expiration time for the JWT. It's typically represented as a Unix timestamp or a numeric date.
        "exp": expire,
        # nbf (Not Before): Specifies the "not before" time before which the JWT must not be accepted for processing. Like exp, it's represented as a Unix timestamp or a numeric date.
        # iat (Issued At): Indicates the time at which the JWT was issued. Like exp and nbf, it's represented as a Unix timestamp or a numeric date.
        "iat": at,
        # sub (Subject): Identifies the subject of the JWT, typically representing the user or entity that the token is about.
        "sub": str(subject),
        # jti (JWT ID): Provides a unique identifier for the JWT. This can be useful for preventing token replay attacks.
        # scope: Specifies the permissions or access levels associated with the token. It's often used in OAuth 2.0 and OpenID Connect to define the scope of the access token.
        # nonce: Used in authentication flows like OAuth 2.0 to prevent replay attacks by requiring a unique value for each request.
        # acr (Authentication Context Class Reference): Describes the level of assurance or authentication context for the authentication process.
        **(extra_data_to_encode or {}),
    }
    encoded_jwt = jwt.encode(
        to_encode,
        TOKENS_SETTINGS.APP_SECRET + token_context_key,
        algorithm=TOKENS_SETTINGS.encoding_algorithm,
    )
    return encoded_jwt
