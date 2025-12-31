import pytest
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from sqlmodel import Field
import sqlalchemy as sa
from libs.resource.resource import Resource
from libs.utils.deps import get_deps


class EndpointResource(Resource, table=True):
    __tablename__ = "test_endpoint_resources"
    __kind__ = "test_endpoint_resource"
    name: str
    size: str = Field(sa_type=sa.String)


@pytest.fixture
def mock_deps():
    mock_user = MagicMock()
    mock_session = MagicMock()
    mock_translator = MagicMock()
    return mock_user, mock_session, mock_translator


@pytest.fixture
def mock_db():
    with patch("libs.endpoints.endpoints.context_db") as mock_context_db:
        mock_db_instance = MagicMock()
        mock_context_db.return_value.__enter__.return_value = mock_db_instance
        yield mock_db_instance
