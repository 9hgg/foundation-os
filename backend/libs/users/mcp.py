"""
MCP tools for the users / authentication domain.

Import this module in your MCP app and call ``register_user_mcp_tools`` to
expose login capabilities to MCP clients.
"""

from mcp.server.fastmcp import FastMCP


from libs.db import context_db
from libs.logger.customLogger import print_color
from libs.users.models import User
from libs.utils import crypto, tokens


def register_user_mcp_tools(mcp: FastMCP) -> None:
    """
    Register user / auth MCP tools on *mcp*.

    Args:
        mcp: The FastMCP server instance to register tools on.
    """

    @mcp.tool()
    def login(email: str, password: str) -> dict:
        """
        Authenticate with an email/password pair and obtain a JWT auth token required by all protected tools.

        Call this tool first whenever the user has not yet authenticated.  The returned
        ``auth_token`` must be forwarded as the ``auth_token`` argument to every tool that
        requires authentication.  Do not call ``get_current_user`` to check identity before
        calling this — call ``login`` directly when credentials are available.

        When to use this vs alternatives:
        - Use ``login`` to obtain a fresh token from credentials.
        - Use ``get_current_user`` when you already hold a token and only need to confirm
          which user it belongs to (profile lookup, not authentication).

        Success / retry guidance:
        - SUCCESS: response contains `auth_token`.
        - RETRY if `error: invalid_credentials`: credentials are wrong — do not retry automatically, ask the user.
        - RETRY if `error: no_password`: OAuth-only account — cannot login with password.

        Args:
            email: The user's email address, e.g. ``"alice@example.com"``.
            password: The user's plain-text password.

        Returns:
            On success: ``{"auth_token": "<jwt>", "user_id": "<uuid>", "email": "alice@example.com"}``.
            On failure: ``{"error": "invalid_credentials"|"no_password", "message": "<human-readable reason>"}``.

        Example prompts:
        - "Log in as alice@example.com with password hunter2."
        - "Authenticate so I can create a folder."
        """
        print_color("cyan", f"[MCP] login: email={email!r}")
        with context_db() as db:
            user: User | None = db.query(User).filter(User.email == email.lower()).first()

        if not user:
            print_color("yellow", f"[MCP] login: no user found for {email!r}")
            return {"error": "invalid_credentials", "message": "Invalid email or password."}
        if not user.password_hashed:
            print_color("yellow", f"[MCP] login: user {email!r} has no password")
            return {"error": "no_password", "message": "This account has no password set. Use an OAuth provider instead."}
        if not crypto.verify_secret(password, user.password_hashed):
            print_color("yellow", f"[MCP] login: wrong password for {email!r}")
            return {"error": "invalid_credentials", "message": "Invalid email or password."}

        auth_token = tokens.create_jwt_token(token_context_key="auth", subject=user.id)
        print_color("cyan", f"[MCP] login: success for user_id={user.id!s}")
        return {"auth_token": auth_token, "user_id": str(user.id), "email": user.email}

    @mcp.tool()
    def get_current_user(auth_token: str) -> dict:
        """
        Return the profile (id, email, pseudo) of the user who owns the given JWT token.

        Use this to verify which user is currently authenticated or to retrieve the
        ``user_id`` when only the token is known.  Do not call this before ``login`` —
        you need a valid token first.

        When to use this vs alternatives:
        - Use ``get_current_user`` when you have a token and want to know the identity
          of its owner without hitting any resource-specific endpoint.
        - Use ``login`` when you need to obtain a token from email/password credentials.

        Success / retry guidance:
        - SUCCESS: response contains `user_id` and `email`.
        - RETRY if `error: unauthorized`: token is expired or invalid — call `login` to get a fresh token.

        Args:
            auth_token: JWT bearer token obtained from the ``login`` tool,
                        e.g. ``"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."``.

        Returns:
            On success: ``{"user_id": "<uuid>", "email": "alice@example.com", "pseudo": "alice"}``.
            On failure: ``{"error": "unauthorized", "message": "Invalid or expired auth_token."}``.

        Example prompts:
        - "Who am I logged in as?"
        - "What is the user_id for my current session?"
        """
        print_color("cyan", "[MCP] get_current_user: called")
        from libs.mcp.auth import get_user_from_token

        user = get_user_from_token(auth_token)
        if not user:
            print_color("yellow", "[MCP] get_current_user: invalid or expired token")
            return {"error": "unauthorized", "message": "Invalid or expired auth_token."}

        print_color("cyan", f"[MCP] get_current_user: user_id={user.id!s} email={user.email!r}")
        return {"user_id": str(user.id), "email": user.email, "pseudo": user.pseudo}
