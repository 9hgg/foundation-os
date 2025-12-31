# Endpoints Library

## Description
The `endpoints` library provides a powerful abstraction for creating standardized CRUD (Create, Read, Update, Delete) API endpoints for resources. It handles common patterns like pagination, filtering, sorting, and access control (ACLs).

## Key Components

### CRUD Generator
`libs.endpoints.endpoints`
- **`create_crud_endpoints`**: The core function that generates a FastAPI router with standard endpoints for a given resource model.
    - `GET /`: List resources (paginated, filtered, sorted).
    - `GET /{id}`: Retrieve a single resource.
    - `POST /`: Create a new resource.
    - `PATCH /{id}`: Update a resource.
    - `DELETE /{id}`: Delete a resource.
    - `GET /find-page/{id}`: Find which page a resource is on (WIP).

### Filtering and Sorting
- **`ItemFilter`**: Model for defining filters (field, value, match type, comparison).
- **`decode_filters`**: Parses query parameters into filter objects.
- **`add_acl_filters`**: Automatically applies ACL constraints to database queries, ensuring users only see what they are allowed to see.

### Types
`libs.endpoints.types`
- **`PaginatedResponse`**: Standard response structure for lists (`data`, `total_count`, `page`, `next`, `prev`).
- **`SimpleResponse`**: Standard response structure for single items.

## Usage Example

```python
from libs.endpoints import create_crud_endpoints
from my_app.models import MyResource

router = create_crud_endpoints(
    MyResource,
    prefix="/api/my-resources",
    tags=["my-resources"],
    include_create=True,
    include_read=True
)
```

## Dependencies
- `fastapi`
- `sqlalchemy`
- `pydantic`
- `libs.acl` (for automatic permission handling)
- `libs.resource`
- `libs.db`
