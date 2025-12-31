# Users Library

## Description
The `users` library handles user management, authentication, and user-related configurations. It provides the data model for users and API endpoints for registration, login, profile updates, and password management.

## Key Components

### Models
`libs.users.models`
- **`User`**: The core user entity, storing personal info (name, email), authentication data (hashed password), and configuration.
- **`UserConfig`**: Stores user preferences like notification settings and profile picture ID.
- **`BillingConfig`**: Stores billing-related information (e.g., Stripe customer ID).

### API
`libs.users.api`
Provides endpoints for:
- **Authentication**: `/auth/register`, `/auth/login`, `/auth/oauth2`.
- **Profile Management**: `/profile/update`, `/me`.
- **Password Reset**: `/password/request-reset`, `/password/reset-password/new-password`.
- **Email Verification**: `/email/send-verification`, `/email/verify-claim`.

### Methods
`libs.users.methods`
- **`get_current_user_optional`**: A dependency to retrieve the current authenticated user from the request token.
- **`CustomOAuth2PasswordBearerCookie`**: Custom OAuth2 implementation that checks both headers and cookies for the bearer token.

## Usage Examples

### Protecting an Endpoint
```python
from fastapi import Depends
from libs.users.models import User
from libs.users.methods import get_current_user_optional

@app.get("/protected")
def protected_route(user: User = Depends(get_current_user_optional)):
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"message": f"Hello {user.pseudo}"}
```

## Dependencies
- `fastapi`
- `sqlalchemy`
- `sqlmodel`
- `jose` (JWT handling)
- `libs.db`
- `libs.utils` (crypto, emails, tokens)
- `libs.tasks` (sending emails)
