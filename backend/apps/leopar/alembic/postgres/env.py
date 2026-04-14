import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool
from sqlmodel import SQLModel

# this line is necessary for SQLModel to list all models
from apps.leopar.app import *

# if not set, raise error
DATABASE_URL = os.getenv("SQLALCHEMY_DATABASE_URI")
if not DATABASE_URL:
    print("ERROR: SQLALCHEMY_DATABASE_URI not set")
    exit(1)


print("ALEMBIC ENV SETUP", os.getenv("SQLALCHEMY_DATABASE_URI"))


# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
fileConfig(config.config_file_name)


target_metadata = SQLModel.metadata


def get_url():
    return os.getenv("SQLALCHEMY_DATABASE_URI", "<no_database_uri>")


def run_migrations_offline():
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = get_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    print("Running migration offline")
    run_migrations_offline()
else:
    print("Running migration online")
    run_migrations_online()
