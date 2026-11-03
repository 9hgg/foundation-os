"""add state to articles

Revision ID: d4f7ac3b6e54
Revises: ac141d3fceba
Create Date: 2026-08-23

An article can be archived, which takes it out of the lists without deleting anything. Null is
the live state, so nothing needs backfilling.
"""
import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision = 'd4f7ac3b6e54'
down_revision = 'ac141d3fceba'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('articles', sa.Column('state', sqlmodel.sql.sqltypes.AutoString(), nullable=True))


def downgrade() -> None:
    op.drop_column('articles', 'state')
