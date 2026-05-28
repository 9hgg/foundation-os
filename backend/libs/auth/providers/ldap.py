from __future__ import annotations

from dataclasses import dataclass

from ldap3 import ALL, SIMPLE, Connection, Server, Tls
from ldap3.core.exceptions import LDAPBindError, LDAPException, LDAPSocketOpenError
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.orm import Session

import libs.utils.tokens
from libs.auth.providers._generic import TokenProcessingResult
from libs.db import context_db
from libs.users.errors import UserNotCreatedError
from libs.users.models import User

from .errors import EmailNotFoundError, InvalidLDAPDataError, NoLDAPDataError


class LDAPSettings(BaseSettings):
    """LDAP provider settings."""

    LDAP_URL: str | None = None
    LDAP_LOGIN: str | None = None
    LDAP_PASSWORD: str | None = None
    LDAP_BASE_DN: str | None = None
    LDAP_USER_DN_TEMPLATE: str | None = None
    LDAP_USER_SEARCH_FILTER: str = (
        "(|(mail={login})(userPrincipalName={login})(sAMAccountName={login})(uid={login}))"
    )
    LDAP_EMAIL_ATTRIBUTE: str = "mail"
    LDAP_FIRST_NAME_ATTRIBUTE: str = "givenName"
    LDAP_LAST_NAME_ATTRIBUTE: str = "sn"
    LDAP_DISPLAY_NAME_ATTRIBUTE: str = "displayName"
    LDAP_USE_SSL: bool = False
    LDAP_START_TLS: bool = False
    LDAP_CONNECT_TIMEOUT: int = 5

    model_config = SettingsConfigDict(case_sensitive=True, extra="ignore")

    @property
    def bind_dn(self) -> str | None:
        return self.LDAP_LOGIN

    @property
    def bind_password(self) -> str | None:
        return self.LDAP_PASSWORD


LDAP_SETTINGS = LDAPSettings()


@dataclass
class LDAPAuthenticatedUser:
    email: str
    first_name: str | None = None
    last_name: str | None = None
    display_name: str | None = None
    dn: str | None = None


class LDAPProvider:
    """LDAP authentication provider backed by ldap3."""

    def __init__(self, settings: LDAPSettings | None = None):
        self.settings = settings or LDAP_SETTINGS

    def authenticate(self, *, login: str, password: str) -> LDAPAuthenticatedUser:
        if not login or not password:
            raise NoLDAPDataError()
        if not self.settings.LDAP_URL:
            raise InvalidLDAPDataError()

        try:
            server = self._build_server()
            with self._service_connection(server) as service_connection:
                user_dn, attributes = self._resolve_user(service_connection, login=login)
            with self._user_connection(server, user_dn=user_dn, password=password):
                pass
        except (LDAPBindError, LDAPSocketOpenError, LDAPException) as exc:
            raise InvalidLDAPDataError() from exc

        email = self._get_attribute(attributes, self.settings.LDAP_EMAIL_ATTRIBUTE)
        if email is None and "@" in login:
            email = login
        if email is None:
            raise EmailNotFoundError()

        return LDAPAuthenticatedUser(
            email=email.lower(),
            first_name=self._get_attribute(
                attributes, self.settings.LDAP_FIRST_NAME_ATTRIBUTE
            ),
            last_name=self._get_attribute(
                attributes, self.settings.LDAP_LAST_NAME_ATTRIBUTE
            ),
            display_name=self._get_attribute(
                attributes, self.settings.LDAP_DISPLAY_NAME_ATTRIBUTE
            ),
            dn=user_dn,
        )

    def _build_server(self) -> Server:
        tls = Tls(validate=0) if self.settings.LDAP_USE_SSL else None
        return Server(
            self.settings.LDAP_URL,
            use_ssl=self.settings.LDAP_USE_SSL,
            connect_timeout=self.settings.LDAP_CONNECT_TIMEOUT,
            get_info=ALL,
            tls=tls,
        )

    def _bind_connection(
        self,
        *,
        server: Server,
        user: str | None,
        password: str | None,
    ) -> Connection:
        connection = Connection(
            server,
            user=user,
            password=password,
            authentication=SIMPLE,
            raise_exceptions=True,
            auto_bind=False,
        )
        connection.open()
        if self.settings.LDAP_START_TLS:
            connection.start_tls()
        connection.bind()
        return connection

    def _service_connection(self, server: Server) -> Connection:
        if self.settings.bind_dn and self.settings.bind_password:
            return self._bind_connection(
                server=server,
                user=self.settings.bind_dn,
                password=self.settings.bind_password,
            )
        return self._bind_connection(server=server, user=None, password=None)

    def _user_connection(self, *, server: Server, user_dn: str, password: str) -> Connection:
        return self._bind_connection(server=server, user=user_dn, password=password)

    def _resolve_user(
        self,
        connection: Connection,
        *,
        login: str,
    ) -> tuple[str, dict[str, object]]:
        if self.settings.LDAP_USER_DN_TEMPLATE:
            user_dn = self.settings.LDAP_USER_DN_TEMPLATE.format(login=login)
            attributes = self._fetch_user_attributes(connection, user_dn=user_dn, login=login)
            return user_dn, attributes

        if not self.settings.LDAP_BASE_DN:
            raise InvalidLDAPDataError()

        search_filter = self.settings.LDAP_USER_SEARCH_FILTER.format(login=login)
        connection.search(
            search_base=self.settings.LDAP_BASE_DN,
            search_filter=search_filter,
            attributes=self._requested_attributes(),
            size_limit=2,
        )
        if len(connection.entries) != 1:
            raise InvalidLDAPDataError()

        entry = connection.entries[0]
        return entry.entry_dn, dict(entry.entry_attributes_as_dict)

    def _fetch_user_attributes(
        self,
        connection: Connection,
        *,
        user_dn: str,
        login: str,
    ) -> dict[str, object]:
        if not self.settings.LDAP_BASE_DN:
            return {self.settings.LDAP_EMAIL_ATTRIBUTE: login}

        search_filter = f"(distinguishedName={user_dn})"
        connection.search(
            search_base=self.settings.LDAP_BASE_DN,
            search_filter=search_filter,
            attributes=self._requested_attributes(),
            size_limit=1,
        )
        if not connection.entries:
            return {self.settings.LDAP_EMAIL_ATTRIBUTE: login}
        return dict(connection.entries[0].entry_attributes_as_dict)

    def _requested_attributes(self) -> list[str]:
        return list(
            {
                self.settings.LDAP_EMAIL_ATTRIBUTE,
                self.settings.LDAP_FIRST_NAME_ATTRIBUTE,
                self.settings.LDAP_LAST_NAME_ATTRIBUTE,
                self.settings.LDAP_DISPLAY_NAME_ATTRIBUTE,
            }
        )

    @staticmethod
    def _get_attribute(attributes: dict[str, object], attribute_name: str) -> str | None:
        value = attributes.get(attribute_name)
        if isinstance(value, list):
            return str(value[0]) if value else None
        if value is None:
            return None
        return str(value)


def _extract_login_payload(details: dict) -> tuple[str, str]:
    login = details.get("login") or details.get("username") or details.get("email")
    password = details.get("password")
    if not login or not password:
        raise NoLDAPDataError()
    return str(login), str(password)


def process_token(
    details: dict,
    register_user: bool = False,
    _db: Session | None = None,
) -> TokenProcessingResult:
    """Verify LDAP credentials and return a JWT token plus the matching user."""

    login, password = _extract_login_payload(details)
    ldap_user = LDAPProvider().authenticate(login=login, password=password)

    user_db = User.get_first_by(email=ldap_user.email, _db=_db)

    if user_db:
        if not user_db.email_verified:
            user_db.email_verified = True
            User.patch(obj_id=user_db.id, update_dict={"email_verified": True}, _db=_db)
    else:
        if not register_user:
            return TokenProcessingResult(
                auth_token=None, user=None, status="unregistered"
            )

        pseudo = ldap_user.display_name or ldap_user.email.split("@")[0]
        user_to_create_dict = {
            "email": ldap_user.email,
            "first_name": ldap_user.first_name,
            "last_name": ldap_user.last_name,
            "pseudo": pseudo,
            "email_verified": True,
            "config": User.__config_type__(
                notification_digest_frequency="daily"
            ).model_dump(),
        }

        with context_db(_db) as db:
            user_db = User(**user_to_create_dict)
            db.add(user_db)
            db.commit()
        if not user_db:
            raise UserNotCreatedError()

    auth_token = libs.utils.tokens.create_jwt_token(
        token_context_key="auth", subject=user_db.id  # noqa: S106
    )
    return TokenProcessingResult(
        auth_token=auth_token,
        user=user_db,
        status="registered",
    )
