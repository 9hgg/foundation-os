"""add config to mails

Revision ID: ac141d3fceba
Revises: c3f6a9d1e470
Create Date: 2026-08-17

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "ac141d3fceba"
down_revision = "c3f6a9d1e470"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default so the rows already in the table land on an empty config rather than NULL,
    # and so any code still inserting without one keeps working.
    op.add_column(
        "mails",
        sa.Column(
            "config",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )


def downgrade() -> None:
    op.drop_column("mails", "config")
