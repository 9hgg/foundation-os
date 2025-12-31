import typing

from fastapi import Depends
from sqlalchemy.orm import Session

from .methods import yield_db

Session__dep = typing.Annotated[Session, Depends(yield_db)]
