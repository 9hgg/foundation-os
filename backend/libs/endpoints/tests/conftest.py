from unittest.mock import MagicMock, patch

import pytest
import sqlalchemy as sa
from sqlmodel import Field

from libs.resource.resource import Resource


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
