# Cache Library

## Description
The `cache` library provides a simple interface for caching data using Redis. It supports setting, getting, and deleting keys with configurable Time-To-Live (TTL).

## Key Components

### Cacher
`libs.cache.cacher`
- **`Cacher`**: The main class for interacting with Redis.
    - `connect()`: Establishes a connection to Redis.
    - `set(key, value, ttl)`: Stores a value (serialized as JSON) with an optional TTL.
    - `get(key)`: Retrieves a value (WIP).
    - `delete(key)`: Removes a key.
    - `flush()`: Clears the entire cache.

### Configuration
`libs.cache.config`
- **`CACHE_SETTINGS`**: Configuration settings, primarily `REDIS_URL`.

## Usage Examples

### Using the Global Cacher
```python
from libs.cache import get_cacher

cacher = get_cacher()
await cacher.set("my_key", {"data": 123}, ttl=60)
```

## Dependencies
- `redis` (redis-py)
- `pydantic-settings`
