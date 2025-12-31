# Canvas Library

## Description
The `canvas` library defines the data models for a visual canvas interface, likely used for building workflows, diagrams, or UI layouts. It includes structures for blocks, connections, and the canvas itself.

## Key Components

### Models
`libs.canvas.models`
- **`Store`**: The root container holding multiple canvases.
- **`Canvas`**: Represents a single canvas workspace containing blocks and connections.
- **`Block`**: A node on the canvas with position, dimensions, and data.
- **`Connexion`**: A link between two blocks (or their interface nodes).
- **`InterfaceNode`**: Input/Output points on a block.

## Usage Examples

### Defining a Block
```python
from libs.canvas.models import Block

block = Block(
    id="block_1",
    name="Start Node",
    pos_x=100,
    pos_y=100,
    width=200,
    height=100,
    layer=1,
    data={"some_config": "value"}
)
```

## Dependencies
- `pydantic`
- `libs.utils` (for `BaseModelWithConfig`)
