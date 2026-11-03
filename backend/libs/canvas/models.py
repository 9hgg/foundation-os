
from pydantic import Field

from libs.utils.types import PYDANTIC_BASE_CONFIG_DICT, BaseModelWithConfig


class InterfaceNode(BaseModelWithConfig):
    """Interface for a block input/output node."""

    id: str
    name: str
    type: str
    kind: str  # 'input' | 'output'


class Connexion(BaseModelWithConfig):
    """Connection between two interface nodes."""

    id: str
    left_block_id: str
    left_interface_node_id: str
    right_block_id: str
    right_interface_node_id: str
    kind: str


class Block(BaseModelWithConfig):
    """Interface for a canvas block."""

    id: str  # Node ID
    name: str  # Name of the block type
    html: str | None = None  # HTML content or template
    custom_builder: str | None = None  # The ID of a template tag in the DOM
    html_tag: str | None = None  # The ID of a template tag in the DOM
    html_tag_version: str | None = None  # Optional version attribute for the template
    data: dict = Field(default_factory=dict)  # Node-specific data (Attr equivalent)
    pos_x: float  # X position of the block
    pos_x_units: str | None = None  # X position units (e.g., 'px', 'em', 'rem', 'vw', 'vh', '%')
    pos_y: float  # Y position of the block
    pos_y_units: str | None = None  # Y position units (e.g., 'px', 'em', 'rem', 'vw', 'vh', '%')
    width: float  # Width of the block
    width_units: str | None = None  # Width units (e.g., 'px', 'em', 'rem', 'vw', 'vh', '%')
    height: float  # Height of the block
    height_units: str | None = None  # Height units (e.g., 'px', 'em', 'rem', 'vw', 'vh', '%')
    layer: int  # Layer of the block
    background_color: str | None = None  # Background color of the block
    text_color: str | None = None  # Text color of the block
    special_function: dict | None = None  # Special function of the block (e.g., 'next', 'prev')
    interfaces: dict[str, InterfaceNode] | None = None  # Inputs/outputs of the block


class Canvas(BaseModelWithConfig):
    """Interface for a Canvas."""

    id: str
    name: str | None = None
    blocks: dict[str, Block] = Field(default_factory=dict)  # Dictionary of blocks
    rank: int  # Rank : layers
    background_color: str | None = None
    text_color: str | None = None
    policy_id: str | None = None
    connexions: list[Connexion] | None = None


PYDANTIC_BASE_CONFIG_DICT_ALLOWED_EXTRA = PYDANTIC_BASE_CONFIG_DICT.copy()
PYDANTIC_BASE_CONFIG_DICT_ALLOWED_EXTRA["extra"] = "allow"


class Store(BaseModelWithConfig):
    """Main DADCanvas data structure."""

    id: str | None = None
    canvases: dict[str, Canvas] = Field(default_factory=dict)  # Dictionary of canvases
    # flows: dict | None = Field(exclude=True)  # retrocompatibility, flows are not used anymore
    name: str | None = None

    model_config = PYDANTIC_BASE_CONFIG_DICT_ALLOWED_EXTRA
