import uuid
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.articles.api import create_crud_article_router
from libs.articles.models import Article
from libs.folders.models import Folder
from libs.utils.deps import get_deps

app = FastAPI()
app.include_router(create_crud_article_router())
client = TestClient(app)


def _set_admin_dependency() -> None:
    admin_user = MagicMock()
    admin_user.email_verified = True
    admin_user.is_admin.return_value = True
    translator = MagicMock()
    translator.translate.side_effect = lambda text: text
    app.dependency_overrides[get_deps] = lambda: (admin_user, None, translator)


def _article(article_id: uuid.UUID) -> Article:
    return Article(
        id=article_id,
        kind="backlog",
        title="Customer request",
        featured=False,
        draft=True,
        tags=[],
        config={"commentsEnabled": True},
    )


def test_admin_folder_assignment_only_adds_membership() -> None:
    _set_admin_dependency()
    article_id = uuid.uuid4()
    folder_id = uuid.uuid4()
    existing_article = _article(article_id)

    with (
        patch.object(Article, "by_id", return_value=existing_article),
        patch.object(Folder, "by_id", return_value=MagicMock()),
        patch("libs.articles.api.add_to_folder") as mock_add_to_folder,
    ):
        response = client.post(
            f"/api/articles/admin/{article_id}/folder",
            json={"folderId": str(folder_id)},
        )

    assert response.status_code == 200
    assert response.json()["result"]["kind"] == "backlog"
    assert response.json()["result"]["draft"] is True
    mock_add_to_folder.assert_called_once_with(
        folder_id=folder_id,
        resource=existing_article,
    )
    app.dependency_overrides = {}


def test_admin_folder_assignment_rejects_non_admin() -> None:
    user = MagicMock()
    user.email_verified = True
    user.is_admin.return_value = False
    translator = MagicMock()
    translator.translate.side_effect = lambda text: text
    app.dependency_overrides[get_deps] = lambda: (user, None, translator)

    response = client.post(
        f"/api/articles/admin/{uuid.uuid4()}/folder",
        json={"folderId": str(uuid.uuid4())},
    )

    assert response.json()["error"]["code"] == "Unauthorized"
    app.dependency_overrides = {}
