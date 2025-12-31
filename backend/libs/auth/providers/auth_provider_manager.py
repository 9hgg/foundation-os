import typing
from typing import Callable, ClassVar

from loguru import logger
from sqlalchemy.orm import Session

from libs.utils.types import BaseModelWithConfig

from ._generic import TokenProcessingResult


class AlreadyEnlistedAuthProviderError(Exception):
    """Exception raised when trying to enlist an auth_provider that is already registered."""

    def __init__(self, auth_provider_name: str):
        super().__init__(f"AuthProvider '{auth_provider_name}' is already enlisted.")
        self.auth_provider_name = auth_provider_name


class AuthProviderNotFoundError(Exception):
    """Exception raised when a requested auth_provider is not found."""

    def __init__(self, auth_provider_name: str):
        super().__init__(f"AuthProvider '{auth_provider_name}' not found.")
        self.auth_provider_name = auth_provider_name


class EnlistedAuthProvider(BaseModelWithConfig):
    auth_provider_name: str
    auth_provider: Callable[[dict, bool, Session | None], TokenProcessingResult]


class AuthProvidersManager:
    """AuthProviders manager"""

    auth_providers: ClassVar[dict[str, EnlistedAuthProvider]] = {}

    @classmethod
    def enlist_auth_provider(
        #
        cls,
        auth_provider_name: str = "default",
    ):
        """Enlist an auth_provider"""

        def decorator(
            auth_provider: typing.Callable, auth_provider_name=auth_provider_name
        ):
            if auth_provider_name is None:
                auth_provider_name = auth_provider.__name__
            if auth_provider_name in cls.auth_providers:
                return
            enlisted_auth_provider = EnlistedAuthProvider(
                auth_provider_name=auth_provider_name, auth_provider=auth_provider
            )
            cls.auth_providers[auth_provider_name] = enlisted_auth_provider
            logger.debug(f"📋 AuthProvider {auth_provider_name} enlisted")
            return auth_provider

        return decorator

    @classmethod
    def get_auth_provider(
        cls, auth_provider_name: str = "default"
    ) -> Callable[[dict, bool, Session | None], TokenProcessingResult] | None:
        """Get a auth_provider by name"""
        if auth_provider_name not in cls.auth_providers:
            return None
        return cls.auth_providers[auth_provider_name].auth_provider
