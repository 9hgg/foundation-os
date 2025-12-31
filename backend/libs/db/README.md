# DB Library

## Description
The `db` library handles database connections, session management, and configuration for the application using SQLAlchemy and SQLModel. It provides utilities for both dependency injection in FastAPI and context managers for standalone usage.

## Key Components

### Session Management
`libs.db.methods`
- **`yield_db`**: A generator function used as a FastAPI dependency to provide a database session. It handles session creation and cleanup.
- **`context_db`**: A context manager for using database sessions outside of FastAPI request lifecycles (e.g., in scripts or background tasks). It can reuse an existing session or create a new one.
- **`SessionLocal`**: The SQLAlchemy `sessionmaker` instance configured with the application's database engine.

### Dependencies
`libs.db.deps`
- **`Session__dep`**: A type alias for `Annotated[Session, Depends(yield_db)]`. Use this in FastAPI path operation functions to inject a database session.

### Configuration
`libs.db.config`
- **`DB_SETTINGS`**: Contains database configuration settings (e.g., URI).

## Usage Examples

### In FastAPI Endpoints
```python
from libs.db.deps import Session__dep

@app.get("/items/")
def read_items(db: Session__dep):
    items = db.query(Item).all()
    return items
```

### In Scripts / Context Managers
```python
from libs.db.methods import context_db

# Create a new session
with context_db() as db:
    items = db.query(Item).all()

# Reuse an existing session if available
def my_function(existing_session=None):
    with context_db(existing_session) as db:
        # db is existing_session if provided, else a new session
        ...
```

## Dependencies
- `sqlalchemy`
- `sqlmodel`
- `fastapi`
- `libs.logger`
