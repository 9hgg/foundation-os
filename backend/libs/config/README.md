# Config Library

## Description
> [!WARNING]
> This library is **DEPRECATED**.

The `libs.config` module was previously used for centralized configuration management but has been removed to prevent accidental imports.

## Current Best Practice
All code should import module-local Pydantic `BaseSettings` instances instead (e.g., `DB_SETTINGS` in `libs.db.config`, `LOGGER_SETTINGS` in `libs.logger.config`).
