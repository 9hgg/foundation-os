import typing

import pydantic
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Query as SqlAlchemyQuery

from libs.utils.types import BaseModelWithConfig, to_camel

M = typing.TypeVar("M")


class PaginatedResponse(BaseModel, typing.Generic[M]):
    data: list[M] = pydantic.Field(
        description="List of items returned in the response",
    )
    total_count: int
    has_prev: bool = pydantic.Field(
        description="Whether there is a previous page",
        default=False,
    )
    prev: str | None = pydantic.Field(
        description="URL of the previous page",
        default=None,
    )
    has_next: bool = pydantic.Field(
        description="Whether there is a next page",
        default=False,
    )
    next: str | None = pydantic.Field(
        description="URL of the next page",
        default=None,
    )
    self: str = pydantic.Field(
        description="URL of the current page",
        default=None,
    )
    all: str = pydantic.Field(
        description="URL of a root page",
        default=None,
    )
    page: int = pydantic.Field(
        description="Current page number",
        default=1,
    )

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SimpleResponse(BaseModelWithConfig, typing.Generic[M]):
    """
    Simple response for a single item
    with optional self and all URLs.
    """

    data: M = pydantic.Field(
        description="Item returned in the response",
    )
    self: str | None = pydantic.Field(
        description="URL of the current page",
        default=None,
    )
    all: str | None = pydantic.Field(
        description="URL of a root page",
        default=None,
    )




def get_paginated_results(query: SqlAlchemyQuery, page=1, page_size=100, root_url="", self=""):
    results = query.limit(page_size).offset((page - 1) * page_size).all()

    total_count = query.count()
    has_prev = page > 1
    has_next = (page * page_size) < total_count

    return PaginatedResponse(
        data=results, # needed to apply camelCase to nested objects
        self=self,
        total_count=total_count,
        has_prev=has_prev,
        prev=f"?page={page - 1}&page_size={page_size}" if has_prev else None,
        has_next=has_next,
        next=f"?page={page + 1}&page_size={page_size}" if has_next else None,
        all=f"{root_url}?page=1&page_size={page_size}",
        page=page,
    )
