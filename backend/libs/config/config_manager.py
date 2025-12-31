"""Deprecated module: ConfigsManager has been removed.

This module is intentionally left as a stub to prevent accidental imports.
All code should import module-local Pydantic settings instances instead.
"""

raise RuntimeError(
    "libs.config.config_manager is deprecated and must not be imported. "
    "Use module-local config.py with BaseSettings instances (e.g., DB_SETTINGS, LOGGER_SETTINGS)."
)
