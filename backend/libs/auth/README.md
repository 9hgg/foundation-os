# Auth Library

## Description
The `auth` library manages authentication providers and handles token processing for the application. It provides a flexible mechanism to register and use different authentication strategies (e.g., LDAP).

## Key Components

### AuthProvidersManager
`libs.auth.providers.auth_provider_manager.AuthProvidersManager`
A manager class that allows registering and retrieving authentication providers.
- **`enlist_auth_provider`**: Decorator to register a new auth provider.
- **`get_auth_provider`**: Retrieve a registered auth provider by name.

### LDAP Provider
`libs.auth.providers.ldap`
An implementation of an authentication provider using LDAP.
- **`process_token`**: Validates credentials/tokens and returns a `TokenProcessingResult`.
- **`LDAPSettings`**: Configuration for LDAP connection (currently a placeholder).

### TokenProcessingResult
`libs.auth.providers._generic.TokenProcessingResult`
A data structure containing the result of an authentication attempt:
- `auth_token`: The generated JWT token.
- `user`: The authenticated user object.
- `status`: Status of the authentication (e.g., "registered", "unregistered").

## Usage Example

```python
from libs.auth.providers.auth_provider_manager import AuthProvidersManager

# Registering a custom provider
@AuthProvidersManager.enlist_auth_provider(auth_provider_name="custom_provider")
def custom_auth_provider(details, register_user, db_session):
    # ... authentication logic ...
    return TokenProcessingResult(...)

# Retrieving a provider
provider = AuthProvidersManager.get_auth_provider("custom_provider")
result = provider(details={"..."}, register_user=True, _db=session)
```

## Dependencies
- `libs.utils` (for tokens and types)
- `libs.users` (for user management)
- `libs.db` (for database access)
- `sqlalchemy`
- `pydantic`
