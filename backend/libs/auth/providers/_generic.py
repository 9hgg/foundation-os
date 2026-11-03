import typing

from libs.users.models import User
from libs.utils.types import BaseModelWithConfig


class TokenProcessingResult(BaseModelWithConfig):
    user: User | None
    auth_token: str | None
    status: typing.Literal["unregistered", "registered"]
