from typing import Any

import sqlmodel
from sqlalchemy.dialects.postgresql import JSONB

from libs.resource import (
    ResourceWithConfig,
)


class Interaction(ResourceWithConfig, table=True):
    __tablename__ = "interactions"
    __kind__ = "interaction"
    __title__ = "Interaction"
    __description__ = "An interaction records anything. In particular it can be used to record what happens from a guest on an interview or a reaction cast."
    __config_type__ = dict

    key: str = sqlmodel.Field(nullable=True)

    config: dict[str, Any] = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=dict,
    )
