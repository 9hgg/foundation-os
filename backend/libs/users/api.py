import secrets
from datetime import datetime, timedelta
from textwrap import dedent
from typing import TypedDict
from uuid import UUID, uuid4

import sqlalchemy as sa
from fastapi import APIRouter, Body, Depends, Form, HTTPException, Request, status
from jose import jwt
from jose.exceptions import JWTError
from pydantic import ValidationError
from starlette.responses import RedirectResponse

import libs.utils.crypto
import libs.utils.emails
import libs.utils.tokens
from libs.acl.methods import create_default_acls
from libs.acl.models import Who
from libs.auth.providers.auth_provider_manager import AuthProvidersManager
from libs.auth.providers.errors import EmailNotFoundError, InvalidLDAPDataError, NoLDAPDataError
from libs.db import context_db
from libs.endpoints import create_crud_endpoints
from libs.i18n.deps import Translator__dep
from libs.logger import print, print_error
from libs.mails.methods import add_mail_to_db
from libs.mails.template_utils import render_transactional_email
from libs.tasks.methods import launch_tasks_processing
from libs.tasks.tasks_manager import TasksManager
from libs.users.config import USER_SETTINGS
from libs.users.methods import get_current_user_optional
from libs.users.models import (
    EDITABLE_BY_ADMIN_USER_FIELDS,
    EDITABLE_USER_CONFIG_FIELDS,
    EDITABLE_USER_FIELDS,
    FormerEmail,
    User,
)
from libs.utils import tokens
from libs.utils.origin import get_origin
from libs.utils.types import EndpointError, EndpointOutput, serialize, to_snake

from . import models


class UserAndToken(TypedDict):
    authToken: str
    user: User


class ListOfUsersAndTokens(TypedDict):
    users: list[UserAndToken]


def create_crud_user_router(prefix: str = "/api/users"):
    crud_user_router = create_crud_endpoints(
        models.User,
        prefix=prefix,
        tags=["users"],
        include_all_by_app=True,
        include_bypass=True,
    )

    # --- Password Reset Endpoints ---

    @crud_user_router.post("/password/request-reset")
    async def request_password_reset(
        request: Request,
        translator: Translator__dep,
        email: str = Body(...),
    ):
        """Send a password reset email to the user if the email exists."""

        if not email:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("No email provided"),
                    code="no_email_provided",
                )
            )

        email = email.lower()
        print("Requesting password reset for email:", email)
        user_db = models.User.get_first_by(email=email)

        # Always show same message for privacy
        if user_db is None:
            print(f"[request_password_reset] No user found for email: {email}")
            return EndpointOutput(
                result={
                    "message": translator.translate(
                        "If the email exists, a reset link will be sent."
                    )
                }
            )

        import secrets

        reset_token = secrets.token_urlsafe(32)
        expiry_time = datetime.now() + timedelta(
            minutes=USER_SETTINGS.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES
        )
        print(
            f"[request_password_reset] Reset token generated for user {user_db.id}: {reset_token}"
        )
        User.patch(
            obj_id=user_db.id,
            update_dict={
                "reset_password_token": reset_token,
                "reset_password_token_expires": expiry_time.isoformat(),
            },
            include=["reset_password_token", "reset_password_token_expires"],
        )

        # Build reset URL pointing to frontend
        frontend_url = USER_SETTINGS.FRONTEND_URL
        if not frontend_url:
            # Fallback to request origin if not configured
            frontend_url = get_origin(request, None)

        if not frontend_url:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Frontend URL not configured"),
                    description=translator.translate(
                        "Please set FRONTEND_URL environment variable"
                    ),
                    code="frontend_url_not_configured",
                )
            )

        reset_url = f"{frontend_url}/auth/reset-claim?token={reset_token}"

        subject = translator.translate("Reset your password")
        expiry_hours = USER_SETTINGS.PASSWORD_RESET_TOKEN_EXPIRY_MINUTES // 60
        expiry_message = " ".join(
            [
                translator.translate("To reset your password, click the button below."),
                translator.translate("This link will expire in"),
                str(expiry_hours),
                translator.translate("hours."),
            ]
        )
        text_content = dedent(
            f"""
            {subject}

            To reset your password, visit: {reset_url}

            This link will expire in {expiry_hours} hours.

            If you did not request this, you can ignore this email.

            ---
            The {USER_SETTINGS.APP_NAME or ""} team
        """
        ).strip()

        # Use transactional email template
        html_content = render_transactional_email(
            title=subject,
            subtitle=translator.translate("You requested a password reset."),
            main_paragraph=expiry_message,
            button_text=translator.translate("Reset Password"),
            button_url=reset_url,
            footer_message=translator.translate(
                "If you did not request this, you can ignore this email."
            ),
        )

        mail = add_mail_to_db(
            sender_email=USER_SETTINGS.SENDER_EMAIL,
            recipient_emails=[user_db.email],
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            priority=1,
        )
        TasksManager.create_task(
            title="send_email",
            custom_id=f"{mail.id}-0",
            method_name="send_email",
            description="Send email",
            kwargs={"mail_id": mail.id},
        )
        print("Email sent:", text_content)
        await launch_tasks_processing()
        return EndpointOutput(
            result={
                "message": translator.translate(
                    "If the email exists, a reset link will be sent."
                )
            }
        )

    @crud_user_router.post("/password/reset-password/new-password")
    async def set_new_password(
        translator: Translator__dep,
        token: str = Body(...),
        password: str = Body(...),
    ):
        """Set a new password using the reset token. Accepts JSON from frontend."""
        if not password or len(password) < 5:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate(
                        "Password too short. You need at least 5 characters"
                    ),
                    code="password_too_short",
                )
            )

        with context_db() as db:
            print(
                f"[set_new_password] Attempting to reset password with token: {token}"
            )
            user_db = User.get_first_by(reset_password_token=token, _db=db)
            if user_db is None:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Invalid or expired reset token"),
                        description=translator.translate(
                            "Please request a new password reset"
                        ),
                        code="invalid_token",
                    )
                )

            # Check expiry
            if user_db.reset_password_token_expires:
                expiry_time = datetime.fromisoformat(
                    user_db.reset_password_token_expires
                )
                if datetime.now() > expiry_time:
                    return EndpointOutput(
                        error=EndpointError(
                            title=translator.translate("Reset token has expired"),
                            description=translator.translate(
                                "Please request a new password reset"
                            ),
                            code="token_expired",
                        )
                    )

            # Set new password
            password_hashed = libs.utils.crypto.hash_secret(password)
            User.patch(
                obj_id=user_db.id,
                update_dict={
                    "password_hashed": password_hashed,
                    "reset_password_token": None,
                    "reset_password_token_expires": None,
                },
                include=[
                    "password_hashed",
                    "reset_password_token",
                    "reset_password_token_expires",
                ],
            )

        return EndpointOutput(
            result={
                "message": translator.translate("Password has been reset successfully")
            }
        )

    @crud_user_router.get("/me")
    async def get_me(
        user_db: User = Depends(get_current_user_optional),
    ):
        return EndpointOutput(result=user_db)

    # move route "me" at the top to avoid conflict with "by-id"
    crud_user_router.routes = [crud_user_router.routes[-1], *crud_user_router.routes[:-1]]

    @crud_user_router.post("/auth/register")
    async def register_user(
        request: Request,
        translator: Translator__dep,
        email: str = Body(...),
        password: str = Body(...),
    ):
        password_hashed = None
        if password is not None:
            if len(password) < 5:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate(
                            "Password too short. You need at least 5 characters"
                        ),
                        code="password_too_short",
                    )
                )

            password_hashed = libs.utils.crypto.hash_secret(password)

        if email:
            # check format
            email_is_valid = libs.utils.emails.is_email_valid(email=email)
            if not email_is_valid:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate(
                            "Email is incorrect",
                        ),
                        code="email_incorrect",
                    )
                )

            # user email is valid

            # to lowercase
            email = email.lower()

            # check unicity
            email_already_used = models.User.get_first_by(email=email) is not None

            if email_already_used:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Email is already being used"),
                        code="email_already_used",
                    )
                )

        user_to_create_dict = {
            "id": uuid4(),
            "password_hashed": password_hashed,
            "email": email,
            "config": models.UserConfig(
                notification_digest_frequency="daily"
            ).model_dump(),
        }

        # need to create user directly to avoid "password_hashed" being excluded
        with context_db() as db:
            user_db = models.User(
                **user_to_create_dict,
            )

            insert_query = sa.insert(User).values(**user_to_create_dict)
            db.execute(insert_query)
            db.commit()
            # db.add(user_db)
            # db.commit()
            user_db = User.by_id(user_to_create_dict["id"], _db=db)
            create_default_acls(
                resource=user_db,
                who=Who.user,
                who_id=user_db.id,
                create_delete_acl=False,
            )

            auth_token = libs.utils.tokens.create_jwt_token(
                token_context_key="auth", subject=user_db.id
            )

            try:
                await send_verification_email(
                    request=request,
                    translator=translator,
                    user_db=user_db,
                )
                print(f"[register_user] Verification email queued for {user_db.email}")
            except Exception as e:
                print_error(f"[register_user] Failed to queue verification email: {e}")

            return EndpointOutput(
                result={
                    "user": user_db,
                    "authToken": auth_token,
                }
            )

    @crud_user_router.post("/auth/login")
    async def login_user(
        translator: Translator__dep,
        email: str = Body(...),
        password: str = Body(...),
    ) -> EndpointOutput[UserAndToken]:
        password = password
        if password is None or email is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate(
                        "Missing password or email.",
                    ),
                    code="missing_password_or_email",
                )
            )

        email = email.lower()

        user_db = models.User.get_first_by(
            email=email,
        )

        if user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate(
                        "User not found with email §user_email.",
                        kv={"user_email": email},
                    ),
                    code="user_not_found",
                )
            )
        if not user_db.password_hashed:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate(
                        "User with email §email has no password set.",
                        kv={"user_email": email},
                    ),
                    code="user_has_no_password_set",
                )
            )
        if not libs.utils.crypto.verify_secret(password, user_db.password_hashed):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate(
                        "Password incorrect.",
                    ),
                    code="password_incorrect",
                )
            )

        auth_token = libs.utils.tokens.create_jwt_token(
            token_context_key="auth",
            subject=user_db.id,
        )
        return EndpointOutput(result=UserAndToken(user=user_db, authToken=auth_token))

    @crud_user_router.post("/auth/oauth2")
    async def login_user_oauth2(
        translator: Translator__dep,
        grant_type: str = Form(...),
        username: str = Form(...),
        password: str = Form(...),
    ):
        a = await login_user(translator, username, password)

        if a.error:
            # return execption
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=a.error.title,
            )
        return {"access_token": a.result.get("authToken"), "token_type": "bearer"}

    @crud_user_router.post(
        "/by-tokens",
        response_model_by_alias=True,
    )
    async def get_users_by_tokens(
        authTokens: list[str] = Body(...),
    ) -> EndpointOutput[ListOfUsersAndTokens]:
        users: list[UserAndToken] = []
        for authToken in authTokens:
            try:
                payload = jwt.decode(
                    authToken,
                    USER_SETTINGS.APP_SECRET + "auth",
                    algorithms=[tokens.TOKENS_SETTINGS.encoding_algorithm],
                )
                sub = payload.get("sub", None)

                if sub is not None:
                    user_db: User | None = User.by_id(sub)
                    if user_db is not None:
                        users.append({"user": user_db, "authToken": authToken})
            except (JWTError, ValidationError):
                pass
        return EndpointOutput(result={"users": serialize(users)})

    @crud_user_router.post("/profile/update")
    async def update_profile(
        translator: Translator__dep,
        # new_data: dict | None = Body(None),
        new_data: dict | None = Body(None, alias="newData"),
        user_db: User = Depends(get_current_user_optional),
        # data os a key of the playload
    ):
        if new_data is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("No data provided"),
                    code="no_data_provided",
                )
            )
        if user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authenticated"),
                    code="not_authenticated",
                )
            )

        # User.patch(obj_id=user_db.id, update_dict=new_data)

        print("(update_profile) user_db:", user_db)
        print("(update_profile) data:", new_data)

        patch_dict = {}
        # check keys are in EDITABLE_USER_FIELDS
        for key in new_data:
            snaked_key = to_snake(key)
            if snaked_key in EDITABLE_USER_FIELDS:
                patch_dict[snaked_key] = new_data[key]
            elif snaked_key == "config":
                # check keys are in EDITABLE_USER_CONFIG_FIELDS
                for config_key in new_data[key].keys():
                    snaked_config_key = to_snake(config_key)
                    if snaked_config_key in EDITABLE_USER_CONFIG_FIELDS:
                        patch_dict["config"] = {
                            snaked_config_key: new_data[key][config_key]
                        }
                    else:
                        print_error("Config key is not editable")
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate(
                                    "Config field §field is not editable.",
                                    kv={"field": config_key},
                                ),
                                code="config_field_not_editable",
                            )
                        )
            else:
                print_error("Key is not editable")
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate(
                            "Field §field is not editable.",
                            kv={"field": key},
                        ),
                        code="field_not_editable",
                    )
                )

        User.patch(obj_id=user_db.id, update_dict=patch_dict)

        return EndpointOutput(result="user updated")

    @crud_user_router.post("/admin/set-password")
    async def admin_set_user_password(
        translator: Translator__dep,
        user_id: str = Body(..., alias="userId"),
        password: str = Body(...),
        current_user: User = Depends(get_current_user_optional),
    ):
        if not current_user or not current_user.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authorized"),
                    code="not_authorized",
                )
            )

        if not password or len(password) < 5:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate(
                        "Password too short. You need at least 5 characters"
                    ),
                    code="password_too_short",
                )
            )

        try:
            user_id_uuid = UUID(user_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invalid user ID"),
                    code="invalid_user_id",
                )
            )

        user_db = models.User.by_id(user_id_uuid)
        if user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("User not found"),
                    code="user_not_found",
                )
            )

        password_hashed = libs.utils.crypto.hash_secret(password)
        User.patch(
            obj_id=user_db.id,
            update_dict={
                "password_hashed": password_hashed,
                "reset_password_token": None,
                "reset_password_token_expires": None,
            },
        )

        return EndpointOutput(
            result={"message": translator.translate("Password updated successfully")}
        )

    @crud_user_router.post("/admin/verify-email")
    async def admin_verify_user_email(
        translator: Translator__dep,
        user_id: str = Body(..., alias="userId", embed=True),
        current_user: User = Depends(get_current_user_optional),
    ):
        if not current_user or not current_user.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authorized"),
                    code="not_authorized",
                )
            )

        try:
            user_id_uuid = UUID(user_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invalid user ID"),
                    code="invalid_user_id",
                )
            )

        user_db = models.User.by_id(user_id_uuid)
        if user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("User not found"),
                    code="user_not_found",
                )
            )

        if user_db.email_verified:
            return EndpointOutput(
                result={"message": translator.translate("Email already verified")}
            )

        User.patch(
            obj_id=user_db.id,
            update_dict={
                "email_verified": True,
                "email_verification_token": None,
                "email_verification_token_expires": None,
            },
        )

        return EndpointOutput(
            result={"message": translator.translate("Email marked as verified")}
        )

    @crud_user_router.get("/admin/by-id/{user_id}")
    async def admin_get_user_by_id(
        user_id: str,
        translator: Translator__dep,
        current_user: User = Depends(get_current_user_optional),
    ):
        if not current_user or not current_user.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authorized"),
                    code="not_authorized",
                )
            )

        try:
            user_id_uuid = UUID(user_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invalid user ID"),
                    code="invalid_user_id",
                )
            )

        user_db = models.User.by_id(user_id_uuid)
        if user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("User not found"),
                    code="user_not_found",
                )
            )

        return EndpointOutput(result=user_db)

    @crud_user_router.get("/admin/connect-as-link/{user_id}")
    async def admin_get_connect_as_link(
        user_id: str,
        request: Request,
        translator: Translator__dep,
        current_user: User = Depends(get_current_user_optional),
    ):
        if not current_user or not current_user.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authorized"),
                    code="not_authorized",
                )
            )

        try:
            user_id_uuid = UUID(user_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invalid user ID"),
                    code="invalid_user_id",
                )
            )

        user_db = models.User.by_id(user_id_uuid)
        if user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("User not found"),
                    code="user_not_found",
                )
            )

        frontend_url = USER_SETTINGS.FRONTEND_URL
        if not frontend_url:
            frontend_url = get_origin(request, None)

        if not frontend_url:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Frontend URL not configured"),
                    description=translator.translate(
                        "Please set FRONTEND_URL environment variable"
                    ),
                    code="frontend_url_not_configured",
                )
            )

        auth_token = tokens.create_jwt_token(
            token_context_key="auth",
            subject=user_db.id,
            extra_data_to_encode={
                "connectedFromUserId": str(current_user.id),
            },
        )
        connect_as_url = f"{frontend_url}?authToken={auth_token}"

        return EndpointOutput(result={"url": connect_as_url})

    @crud_user_router.post("/admin/update")
    async def admin_update_user(
        translator: Translator__dep,
        user_id: str = Body(..., alias="userId", embed=True),
        new_data: dict | None = Body(None, alias="newData", embed=True),
        current_user: User = Depends(get_current_user_optional),
    ):
        if not current_user or not current_user.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authorized"),
                    code="not_authorized",
                )
            )

        if new_data is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("No data provided"),
                    code="no_data_provided",
                )
            )

        try:
            user_id_uuid = UUID(user_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invalid user ID"),
                    code="invalid_user_id",
                )
            )

        user_db = models.User.by_id(user_id_uuid)
        if user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("User not found"),
                    code="user_not_found",
                )
            )

        patch_dict: dict = {}

        for key in new_data:
            snaked_key = to_snake(key)

            if snaked_key == "email":
                raw_email = new_data[key]
                if not isinstance(
                    raw_email, str
                ) or not libs.utils.emails.is_email_valid(email=raw_email):
                    return EndpointOutput(
                        error=EndpointError(
                            title=translator.translate("Invalid email format"),
                            code="invalid_email_format",
                        )
                    )
                email = raw_email.lower()
                existing_user = models.User.get_first_by(email=email)
                if existing_user and existing_user.id != user_id_uuid:
                    return EndpointOutput(
                        error=EndpointError(
                            title=translator.translate("Email is already being used"),
                            code="email_already_used",
                        )
                    )
                patch_dict["email"] = email
                continue

            if snaked_key in EDITABLE_BY_ADMIN_USER_FIELDS:
                patch_dict[snaked_key] = new_data[key]
                continue

            if snaked_key == "config" and isinstance(new_data[key], dict):
                config_patch = patch_dict.get("config", {})
                for config_key in new_data[key]:
                    snaked_config_key = to_snake(config_key)
                    if snaked_config_key in EDITABLE_USER_CONFIG_FIELDS:
                        config_patch[snaked_config_key] = new_data[key][config_key]
                    else:
                        return EndpointOutput(
                            error=EndpointError(
                                title=translator.translate(
                                    "Config field §field is not editable.",
                                    kv={"field": config_key},
                                ),
                                code="config_field_not_editable",
                            )
                        )
                patch_dict["config"] = config_patch
                continue

            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate(
                        "Field §field is not editable.",
                        kv={"field": key},
                    ),
                    code="field_not_editable",
                )
            )

        user_updated = User.patch(obj_id=user_db.id, update_dict=patch_dict)
        return EndpointOutput(result=user_updated)

    @crud_user_router.get("/profile/{user_id}/public-details")
    async def get_user_public_details(
        user_id: str,
        translator: Translator__dep,
        current_user: User = Depends(get_current_user_optional),
    ):
        # check if user_id is a valid UUID
        try:
            user_id = UUID(user_id)
        except ValueError:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invalid user ID"),
                    code="invalid_user_id",
                )
            )

        user_db: models.User | None = models.User.by_id(user_id)
        if user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("User not found"),
                    code="user_not_found",
                )
            )

        is_admin_or_self = False
        if current_user:
            if current_user.id == user_id or current_user.is_admin():
                is_admin_or_self = True

        public_name = user_db.pseudo
        starred_email = None

        if is_admin_or_self:
            # Return enhanced details for admin
            # For admin, publicName can be "First Last (email)" or just "First Last" depending on preference,
            # but usually we want to see who it is.
            name = user_db.first_name or user_db.last_name
            if user_db.first_name and user_db.last_name:
                name = f"{user_db.first_name} {user_db.last_name}"

            public_name = name if name else user_db.pseudo
            # We retun the real email as starredEmail to reuse the field or careful naming?
            # The interface is { publicName, profilePictureId, starredEmail }
            # Let's reuse starredEmail key but put real email in it if admin
            starred_email = user_db.email
        else:
            # Default public behavior
            emailWithStar = user_db.email
            if user_db.email is not None and len(user_db.email.split("@")[0]) > 2:
                # replace all characters except the first and last with *
                emailWithStar = (
                    user_db.email[0]
                    + "***"
                    + user_db.email.split("@")[0][-1]
                    + "@"
                    + user_db.email.split("@")[1][0]
                    + "***"
                )
            starred_email = emailWithStar

        return EndpointOutput(
            result={
                "publicName": public_name,
                "profilePictureId": user_db.config.profile_picture_id,
                "starredEmail": starred_email,
            }
        )

    @crud_user_router.get("/find-by-email/{email}")
    async def find_user_by_email(
        email: str,
        translator: Translator__dep,
        user_db: User = Depends(get_current_user_optional),
    ):
        """Find a user by email address for team management purposes."""
        if user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authenticated"),
                    code="not_authenticated",
                )
            )

        # Validate email format
        if not libs.utils.emails.is_email_valid(email=email):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invalid email format"),
                    code="invalid_email_format",
                )
            )

        email = email.lower()
        found_user = models.User.get_first_by(email=email)

        if found_user is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate(
                        "User not found with email §email.", kv={"email": email}
                    ),
                    code="user_not_found",
                )
            )

        return EndpointOutput(
            result={
                "id": found_user.id,
                "email": found_user.email,
                "firstName": found_user.first_name,
                "lastName": found_user.last_name,
                "pseudo": found_user.pseudo,
            }
        )

    @crud_user_router.post("/email/send-verification")
    async def send_verification_email(
        request: Request,
        translator: Translator__dep,
        user_db: User = Depends(get_current_user_optional),
    ):
        """Send email verification link to the current user's email address."""
        if user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authenticated"),
                    code="not_authenticated",
                )
            )

        if not user_db.email:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("No email address set"),
                    code="no_email_address",
                )
            )

        if user_db.email_verified:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Email already verified"),
                    code="email_already_verified",
                )
            )

        # Generate verification token
        import secrets

        verification_token = secrets.token_urlsafe(32)
        expiry_time = datetime.now() + timedelta(
            minutes=USER_SETTINGS.EMAIL_VERIFICATION_TOKEN_EXPIRY_MINUTES
        )  # Token expires in configured time

        # Update user with verification token
        User.patch(
            obj_id=user_db.id,
            update_dict={
                "email_verification_token": verification_token,
                "email_verification_token_expires": expiry_time.isoformat(),
            },
            include=["email_verification_token", "email_verification_token_expires"],
        )

        frontend_url = USER_SETTINGS.FRONTEND_URL
        print("IN USER SETTINGS, FRONTEND_URL", frontend_url)
        if not frontend_url:
            # Fallback to request origin if not configured
            frontend_url = get_origin(request, None)
            print("IN ORIGIN, FRONTEND_URL", frontend_url)

        if not frontend_url:
            app_root_domain = USER_SETTINGS.APP_ROOT_DOMAIN or "localhost:8000"
            frontend_url = "https://" + app_root_domain
            print("IN APP ROOT DOMAIN, FRONTEND_URL", frontend_url)

        verification_url = (
            f"{frontend_url}/auth/verify-email-claim?token={verification_token}"
        )

        # log the link
        print(
            f"[send_verification_email] Verification URL for user {user_db.email}: {verification_url}"
        )

        # Send verification email
        subject = translator.translate("Verify your email address")
        expiry_hours = USER_SETTINGS.EMAIL_VERIFICATION_TOKEN_EXPIRY_MINUTES // 60
        expiry_message = " ".join(
            [
                translator.translate(
                    "To verify your email address, please click the button below."
                ),
                translator.translate("This link will expire in"),
                str(expiry_hours),
                translator.translate("hours."),
            ]
        )

        html_content = render_transactional_email(
            title=subject,
            subtitle=translator.translate(
                "Please verify your email address to complete your account setup."
            ),
            main_paragraph=expiry_message,
            button_text=translator.translate("Verify Email Address"),
            button_url=verification_url,
            footer_message=translator.translate(
                "If you did not request this verification, you can safely ignore this email. "
                "If you have any questions, please contact us at support@spoken.systems."
            ),
        )

        text_content = dedent(
            f"""
            {subject}

            Please verify your email address to complete your account setup.

            To verify your email address, please visit: {verification_url}

            This link will expire in {expiry_hours} hours.

            If you did not request this verification, you can safely ignore this email.

            ---
            The spOken Team
            """
        ).strip()

        mail = add_mail_to_db(
            sender_email=USER_SETTINGS.SENDER_EMAIL,
            recipient_emails=[user_db.email],
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            priority=1,  # High priority for verification emails
        )

        TasksManager.create_task(
            title="send_email",
            custom_id=f"{mail.id}-0",
            method_name="send_email",
            description="Send email",
            kwargs={
                "mail_id": mail.id,
            },
        )

        await launch_tasks_processing()

        return EndpointOutput(
            result={
                "message": translator.translate("Verification email sent successfully"),
                "email": user_db.email,
            }
        )

    @crud_user_router.post("/email/verify-claim")
    async def verify_email_claim(
        translator: Translator__dep,
        data: dict = Body(...),
    ):
        """Verify email address using the verification token (JSON endpoint for frontend)."""

        token = data.get("token")
        if not token:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invalid request"),
                    description=translator.translate("Token is required"),
                    code="missing_token",
                )
            )

        # Find user by verification token
        with context_db() as db:
            user_db = (
                db.query(User).where(User.email_verification_token == token).first()
            )

            if user_db is None:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("User not found"),
                        description=translator.translate(
                            "No user associated with this verification token"
                        ),
                        code="invalid_token",
                    )
                )

            # Check if token has expired
            if user_db.email_verification_token_expires:
                expiry_time = datetime.fromisoformat(
                    user_db.email_verification_token_expires
                )
                if datetime.now() > expiry_time:
                    return EndpointOutput(
                        error=EndpointError(
                            title=translator.translate("Verification link has expired"),
                            description=translator.translate(
                                "Please request a new verification email"
                            ),
                            code="token_expired",
                        )
                    )

            # Mark email as verified and clear verification token
            User.patch(
                obj_id=user_db.id,
                update_dict={
                    "email_verified": True,
                    "email_verification_token": None,
                    "email_verification_token_expires": None,
                },
            )

            return EndpointOutput(
                result={
                    "message": translator.translate(
                        "Your email address has been successfully verified"
                    )
                }
            )

    @crud_user_router.post("/email/request-change")
    async def request_email_change(
        request: Request,
        translator: Translator__dep,
        new_email: str = Body(..., alias="newEmail", embed=True),
        user_db: User = Depends(get_current_user_optional),
    ):
        """Request an email address change. Sends a confirmation link to the new email address."""
        if user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not authenticated"),
                    code="not_authenticated",
                )
            )

        if not new_email:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("No email provided"),
                    code="no_email_provided",
                )
            )

        new_email = new_email.lower()

        if not libs.utils.emails.is_email_valid(email=new_email):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Email is incorrect"),
                    code="email_incorrect",
                )
            )

        if user_db.email and new_email == user_db.email.lower():
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate(
                        "New email is the same as the current email"
                    ),
                    code="email_unchanged",
                )
            )

        if models.User.get_first_by(email=new_email) is not None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Email is already being used"),
                    code="email_already_used",
                )
            )



        change_token = secrets.token_urlsafe(32)
        expiry_time = datetime.now() + timedelta(
            minutes=USER_SETTINGS.CHANGE_EMAIL_TOKEN_EXPIRY_MINUTES
        )

        User.patch(
            obj_id=user_db.id,
            update_dict={
                "pending_email": new_email,
                "change_email_token": change_token,
                "change_email_token_expires": expiry_time.isoformat(),
            },
            include=[
                "pending_email",
                "change_email_token",
                "change_email_token_expires",
            ],
        )

        frontend_url = USER_SETTINGS.FRONTEND_URL
        if not frontend_url:
            frontend_url = get_origin(request, None)
        if not frontend_url:
            app_root_domain = USER_SETTINGS.APP_ROOT_DOMAIN or "localhost:8000"
            frontend_url = "https://" + app_root_domain

        confirm_url = f"{frontend_url}/auth/change-email-claim?token={change_token}"
        print(
            f"[request_email_change] Confirm URL for user {user_db.email}: {confirm_url}"
        )

        subject = translator.translate("Confirm your new email address")
        expiry_hours = USER_SETTINGS.CHANGE_EMAIL_TOKEN_EXPIRY_MINUTES // 60
        expiry_message = " ".join(
            [
                translator.translate(
                    "To confirm your new email address, click the button below."
                ),
                translator.translate("This link will expire in"),
                str(expiry_hours),
                translator.translate("hours."),
            ]
        )

        html_content = render_transactional_email(
            title=subject,
            subtitle=translator.translate("You requested an email address change."),
            main_paragraph=expiry_message,
            button_text=translator.translate("Confirm New Email"),
            button_url=confirm_url,
            footer_message=translator.translate(
                "If you did not request this change, you can safely ignore this email."
            ),
        )

        text_content = dedent(
            f"""
            {subject}

            To confirm your new email address, visit: {confirm_url}

            This link will expire in {expiry_hours} hours.

            If you did not request this, you can ignore this email.
            """
        ).strip()

        mail = add_mail_to_db(
            sender_email=USER_SETTINGS.SENDER_EMAIL,
            recipient_emails=[new_email],
            subject=subject,
            text_content=text_content,
            html_content=html_content,
            priority=1,
        )
        TasksManager.create_task(
            title="send_email",
            custom_id=f"{mail.id}-0",
            method_name="send_email",
            description="Send email",
            kwargs={"mail_id": mail.id},
        )
        await launch_tasks_processing()

        return EndpointOutput(
            result={
                "message": translator.translate(
                    "A confirmation email has been sent to your new email address"
                )
            }
        )

    @crud_user_router.post("/email/confirm-change")
    async def confirm_email_change(
        translator: Translator__dep,
        data: dict = Body(...),
    ):
        """Confirm an email address change using the token sent to the new email."""
        token = data.get("token")
        if not token:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Invalid request"),
                    description=translator.translate("Token is required"),
                    code="missing_token",
                )
            )

        with context_db() as db:
            user_db = db.query(User).where(User.change_email_token == token).first()

            if user_db is None:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("Invalid or expired token"),
                        description=translator.translate(
                            "Please request a new email change"
                        ),
                        code="invalid_token",
                    )
                )

            if user_db.change_email_token_expires:
                expiry_time = datetime.fromisoformat(user_db.change_email_token_expires)
                if datetime.now() > expiry_time:
                    return EndpointOutput(
                        error=EndpointError(
                            title=translator.translate("Token has expired"),
                            description=translator.translate(
                                "Please request a new email change"
                            ),
                            code="token_expired",
                        )
                    )

            if not user_db.pending_email:
                return EndpointOutput(
                    error=EndpointError(
                        title=translator.translate("No pending email change found"),
                        code="no_pending_email",
                    )
                )

            # Archive the old email in former_emails
            config = user_db.config
            if user_db.email:
                former = list(config.former_emails)
                former.append(
                    FormerEmail(
                        email=user_db.email,
                        changed_at=datetime.now(),
                        was_verified=bool(user_db.email_verified),
                    )
                )
                config.former_emails = former

            User.patch(
                obj_id=user_db.id,
                update_dict={
                    "email": user_db.pending_email,
                    "email_verified": True,
                    "pending_email": None,
                    "change_email_token": None,
                    "change_email_token_expires": None,
                    "config": serialize(config),
                },
                include=[
                    "pending_email",
                    "change_email_token",
                    "change_email_token_expires",
                ],
            )

        return EndpointOutput(
            result={
                "message": translator.translate(
                    "Your email address has been successfully updated"
                )
            }
        )

    @crud_user_router.get("/email/verify/{token}")
    async def verify_email(
        token: str,
        request: Request,
        translator: Translator__dep,
    ):
        """Verify email address using the verification token (legacy HTML endpoint for backward compatibility)."""

        # Get base URL from request
        app_root_domain = USER_SETTINGS.APP_ROOT_DOMAIN or "localhost:8000"
        base_url = get_origin(request, "https://" + app_root_domain)

        # Redirect to frontend verify claim page
        verify_url = f"{base_url}/auth/verify-email-claim?token={token}"

        return RedirectResponse(url=verify_url, status_code=302)

    # RETURN THE ROUTER
    return crud_user_router


def create_auth_providers_router(prefix: str = "/api/auth-providers"):
    auth_providers_router = APIRouter(prefix=prefix, tags=["auth-providers"])

    @auth_providers_router.post("/login/{auth_provider_id}")
    async def login_with_auth_provider(
        auth_provider_id: str,
        details: dict = Body(...),
    ):
        auth_provider = AuthProvidersManager.get_auth_provider(auth_provider_id)
        if auth_provider is None:
            return EndpointOutput(
                error=EndpointError(
                    title="No auth provider found",
                    code="NO_AUTH_PROVIDER_FOUND",
                )
            )
        try:
            return EndpointOutput(result=auth_provider(details, register_user=False))
        except (NoLDAPDataError, InvalidLDAPDataError, EmailNotFoundError) as e:
            return EndpointOutput(
                error=EndpointError(
                    title="Authentication failed",
                    description=str(e),
                    code="AUTH_PROVIDER_ERROR",
                )
            )

    @auth_providers_router.post("/register/{auth_provider_id}")
    async def register_with_auth_provider(
        auth_provider_id: str,
        details: dict = Body(...),
    ):
        auth_provider = AuthProvidersManager.get_auth_provider(auth_provider_id)
        if auth_provider is None:
            return EndpointOutput(
                error=EndpointError(
                    title="No auth provider found",
                    code="NO_AUTH_PROVIDER_FOUND",
                )
            )
        try:
            return EndpointOutput(result=auth_provider(details, register_user=True))
        except (NoLDAPDataError, InvalidLDAPDataError, EmailNotFoundError) as e:
            return EndpointOutput(
                error=EndpointError(
                    title="Authentication failed",
                    description=str(e),
                    code="AUTH_PROVIDER_ERROR",
                )
            )

    return auth_providers_router
