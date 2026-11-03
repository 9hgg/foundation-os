import json
import time
import typing

import structlog
from pydantic.json import pydantic_encoder
from sqlalchemy.orm import Session, sessionmaker
from sqlmodel import create_engine

from libs.db.config import DB_SETTINGS

logger = structlog.get_logger(__name__)

ECHO_ENGINE_LOG = False
DEBUG = False


def json_serializer(*args, **kwargs) -> str:
    return json.dumps(*args, default=pydantic_encoder, **kwargs)

if DB_SETTINGS.SQLALCHEMY_DATABASE_URI.split(":")[0] == "sqlite":
    logger.info("database_engine_configured", driver="sqlite", check_same_thread=False)
    engine = create_engine(
        DB_SETTINGS.SQLALCHEMY_DATABASE_URI,
        # pool_pre_ping=True,
        connect_args={"check_same_thread": False, "timeout": 10},
        echo=ECHO_ENGINE_LOG,
    )
else:
    logger.info("database_engine_configured", driver=DB_SETTINGS.SQLALCHEMY_DATABASE_URI.split(":", 1)[0])
    engine = create_engine(
        DB_SETTINGS.SQLALCHEMY_DATABASE_URI,
        pool_pre_ping=True,
        pool_size=DB_SETTINGS.DB_POOL_SIZE,
        max_overflow=DB_SETTINGS.DB_MAX_OVERFLOW,
        pool_timeout=30,
        pool_recycle=DB_SETTINGS.DB_POOL_RECYCLE_SECONDS,
        echo=ECHO_ENGINE_LOG,
    )

logger.info("database_session_configured", driver=DB_SETTINGS.SQLALCHEMY_DATABASE_URI.split(":", 1)[0])

# About autocommit and autoflush:
# https://stackoverflow.com/questions/4201455/sqlalchemy-whats-the-difference-between-flush-and-commit

# we use mostly short-lived sessions that are not likely to see concurrent modifications
# so expire_on_commit to False may have negligible risks and could be used.
SessionLocal = sessionmaker(
    autoflush=False,
    bind=engine,
    # expire_on_commit=False,
)
# Global variable to track the number of active sessions
NB_SESSIONS = 0
WARNING_THRESHOLD = 10


def yield_db() -> typing.Generator:
    global NB_SESSIONS
    NB_SESSIONS += 1
    session = SessionLocal()
    if NB_SESSIONS >= WARNING_THRESHOLD:
        logger.warning("database_pool_threshold_reached", pool_status=engine.pool.status(), active_sessions=NB_SESSIONS)
    try:
        yield session
    finally:
        session.close()
        NB_SESSIONS -= 1
        if NB_SESSIONS >= WARNING_THRESHOLD:
            logger.debug("database_session_released", active_sessions=NB_SESSIONS)


class context_db:
    existing_db: Session | None
    title: str | None
    session: Session

    tick: int = 0

    def __init__(self, existing_db: Session | None = None, *, title: str | None = None):
        self.existing_db = existing_db
        self.title = title

    def __enter__(self):
        self.tick = time.perf_counter_ns()

        if self.title:
            logger.debug("database_context_opening", title=self.title, existing_db=self.existing_db is not None)
        if self.existing_db is not None:
            return self.existing_db
        global NB_SESSIONS
        NB_SESSIONS += 1
        self.session = SessionLocal()

        # session will be usedi n a context as "db" and called like this: db.query(...)
        # let's just add proxy over query to add some logging

        original_query = self.session.query

        def query(*args, **kwargs):
            if DEBUG:
                logger.debug("database_query", arg_count=len(args), kwarg_keys=sorted(kwargs))
            return original_query(*args, **kwargs)

        self.session.query = query

        # if NB_SESSIONS >= WARNING_THRESHOLD:
        return self.session

    def __exit__(self, _type, value, traceback):
        if self.title:
            logger.debug("database_context_closing", title=self.title, existing_db=self.existing_db is not None)
        if self.existing_db is not None:
            return
        if self.session is None:
            raise Exception("session is None")  # noqa: TRY002, TRY003
        self.session.close()
        global NB_SESSIONS
        NB_SESSIONS -= 1
        # if NB_SESSIONS >= WARNING_THRESHOLD:

        toc = time.perf_counter_ns()
        # time elapsed in seconds (not nanoseconds)
        elapsed = (toc - self.tick) / 1_000_000_000
        if DEBUG:
            logger.debug("database_context_elapsed", title=self.title, elapsed_seconds=round(elapsed, 2))
