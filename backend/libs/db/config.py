from pydantic_settings import BaseSettings, SettingsConfigDict


class DBSettings(BaseSettings):
    SQLALCHEMY_DATABASE_URI: str
    # Defaults match the previous hardcoded values (fine against a direct Postgres
    # connection). Apps routed through a connection pooler with a hard client cap
    # (e.g. Supabase's session-mode pooler) must override these — each process
    # (each uvicorn worker, each Cloud Run execution) opens up to
    # DB_POOL_SIZE + DB_MAX_OVERFLOW connections, and that easily exceeds a small
    # pooler budget once multiplied across concurrent processes.
    DB_POOL_SIZE: int = 20
    DB_MAX_OVERFLOW: int = 30
    # Recycle pooled connections well under the server/pooler idle timeout. Supabase's
    # session-mode pooler drops idle connections within minutes, so a stale one errors
    # mid-query (Sentry OperationalError 'connection ... closed'); 300s stays ahead of that.
    DB_POOL_RECYCLE_SECONDS: int = 300

    model_config = SettingsConfigDict(case_sensitive=True)


DB_SETTINGS = DBSettings()
