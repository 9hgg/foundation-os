# Utils Library

## Description
The `utils` library provides common utility functions and types used across the application. It includes modules for cryptography, token generation, type definitions, and other helper functions.

## Key Components

### Types
`libs.utils.types`
- **`BaseModelWithConfig`**: A Pydantic base model configured with common settings (camelCase aliases, etc.).
- **`EndpointOutput`**: A standard response wrapper for API endpoints, containing `result` or `error`.
- **`EndpointError`**: Standard error structure for API responses.
- **`serialize`**: Helper function to serialize objects (including Pydantic models and UUIDs) into JSON-compatible formats.

### Tokens
`libs.utils.tokens`
- **`create_jwt_token`**: Generates a JSON Web Token (JWT) with a specified subject and expiration.

### Crypto
`libs.utils.crypto`
- **`hash_secret`**: Hashes a secret (e.g., password) using Argon2.
- **`verify_secret`**: Verifies a secret against a hash.

### Origin
`libs.utils.origin`
- **`get_origin`**: Helper to extract the request origin, useful for constructing absolute URLs (e.g., for email links).

## Usage Examples

### Creating a JWT
```python
from libs.utils.tokens import create_jwt_token

token = create_jwt_token(
    token_context_key="auth",
    subject="user_id_123"
)
```

### Hashing a Password
```python
from libs.utils.crypto import hash_secret, verify_secret

hashed = hash_secret("my_password")
is_valid = verify_secret("my_password", hashed)
```

## Dependencies
- `pydantic`
- `sqlmodel`
- `jose` (python-jose)
- `argon2-cffi`
- `humps` (for case conversion)
