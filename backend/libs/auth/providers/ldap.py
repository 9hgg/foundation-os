from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.orm import Session

import libs.utils.tokens
from libs.auth.providers._generic import TokenProcessingResult
from libs.db import context_db
from libs.users.errors import UserNotCreatedError
from libs.users.models import User

from .errors import EmailNotFoundError, InvalidLDAPDataError, NoLDAPDataError


class LDAPSettings(BaseSettings):
    """
    LDAP provider settings.
    No specific variables yet; add here when integrating with a real LDAP service.
    Keeping a settings class for consistency and future strict typing/validation.
    """

    model_config = SettingsConfigDict(case_sensitive=True)


LDAP_SETTINGS = LDAPSettings()


def some_ldap_function(some_ldap_data):
    return {}


def process_token(
    details: dict,
    register_user: bool = False,
    _db: Session | None = None,
) -> TokenProcessingResult:
    """
    TBD
    """

    some_ldap_data = details.get("some_ldap_data")
    if not some_ldap_data:
        raise NoLDAPDataError()

    try:
        # do LDAP stuff
        result = some_ldap_function(some_ldap_data)  # Replace with actual LDAP function
    except ValueError as exc:
        # Invalid something?
        raise InvalidLDAPDataError() from exc

    # Assuming result contains user information (but mail could come details)
    user_email = result.get("email", None)
    if user_email is None:
        raise EmailNotFoundError()
    user_email = user_email.lower()

    roles = result.get("roles", [])

    print("User email", user_email)
    print("User roles", roles)

    user_db = User.get_first_by(email=user_email, _db=_db)

    # If User is not on the db or is on the db but not registered,
    #  it means that a registered account already exist
    if user_db:
        print("User found in DB :", user_db)
        if not user_db.email_verified:
            print("User found in DB but not email verified")
            user_db.email_verified = True
            User.patch(obj_id=user_db.id, update_dict={"email_verified": True}, _db=_db)

    else:
        if not register_user:
            return TokenProcessingResult(
                auth_token=None, user=None, status="unregistered"
            )
        print("User db not in DB")
        user_to_create_dict = {
            "email": user_email,
            "email_verified": True,
            "config": User.__config_type__(
                notification_digest_frequency="daily"
            ).model_dump(),
        }

        # need to create user directly to avoid "password_hashed" being excluded
        with context_db(_db) as db:
            user_db = User(
                **user_to_create_dict,
            )
            db.add(user_db)
            db.commit()
        if not user_db:
            raise UserNotCreatedError()

    auth_token = libs.utils.tokens.create_jwt_token(
        token_context_key="auth", subject=user_db.id  # noqa: S106
    )
    return TokenProcessingResult(
        #
        auth_token=auth_token,
        user=user_db,
        status="registered",
    )

