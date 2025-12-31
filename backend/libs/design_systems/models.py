import uuid
from typing import Optional

import sqlmodel
from pydantic import Field
from sqlalchemy.dialects.postgresql import JSONB

from libs.resource import ResourceWithConfig
from libs.utils.types import BaseModelWithConfig


class Color(BaseModelWithConfig):
    id: str
    name: str
    value: str


class Palette(BaseModelWithConfig):
    id: str
    name: str
    colors: list[Color]


class Font(BaseModelWithConfig):
    id: str
    name: str
    font_family: str
    size: int
    url: str


class DesignSystemConfig(BaseModelWithConfig):
    __kind__ = "design_system_config"
    __description__ = "The config of a design system."
    __title__ = "Design system config"
    __private__ = False
    __category__ = "config"

    palettes: list[Palette] = []
    fonts: list[Font] = []
    images: list[str] = []


class DesignSystem(ResourceWithConfig, table=True):
    __tablename__ = "design_systems"
    __kind__ = "design_system"
    __title__ = "Design system"
    __description__ = "A design system is a collection of reusable components, fonts, palettes, UI rules, etc."
    __config_type__ = DesignSystemConfig

    name: str
    description: str | None
    # simple thumbnail for the design system
    thumbnail_id: Optional[uuid.UUID] = sqlmodel.Field(foreign_key="files.id")

    config: DesignSystemConfig = sqlmodel.Field(
        sa_type=JSONB,
        nullable=False,
        default_factory=lambda: DesignSystemConfig().model_dump(),
    )


class ThemeDetails(BaseModelWithConfig):
    default_background_color: str = "#ffffff"
    default_text_color: str = "#000000"
    design_system_ids: list[str] = Field(default_factory=list)
