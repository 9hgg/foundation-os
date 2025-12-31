import typing

from pydantic import BaseModel

from libs.users.models import User


class TokenProcessingResult(BaseModel):
    user: User | None
    auth_token: str | None
    status: typing.Literal["unregistered", "registered"]
