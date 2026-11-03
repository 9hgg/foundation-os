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


def _set_non_admin_dependency() -> None:
    user = MagicMock()
    user.email_verified = True
    user.is_admin.return_value = False
    translator = MagicMock()
    translator.translate.side_effect = lambda text: text
    app.dependency_overrides[get_deps] = lambda: (user, None, translator)


def test_archiving_files_the_article_away_and_suspends_its_conversations() -> None:
    _set_admin_dependency()
    article_id = uuid.uuid4()
    conversation = MagicMock(id=uuid.uuid4())

    with (
        patch.object(Article, "by_id", return_value=_article(article_id)),
        patch.object(Article, "patch", return_value=_article(article_id)) as patch_article,
        patch("libs.articles.api.context_db") as context,
        patch("libs.articles.api.Conversation") as conversation_class,
    ):
        context.return_value.__enter__.return_value.query.return_value.filter.return_value.all.return_value = [conversation]
        response = client.post(f"/api/articles/admin/{article_id}/state", json={"state": "archived"})

    assert response.json()["error"] is None
    assert patch_article.call_args.kwargs["update_dict"] == {"state": "archived"}
    assert conversation_class.patch.call_args.kwargs["update_dict"] == {"status": "disabled"}


def test_unarchiving_reopens_the_conversations() -> None:
    _set_admin_dependency()
    article_id = uuid.uuid4()
    conversation = MagicMock(id=uuid.uuid4())

    with (
        patch.object(Article, "by_id", return_value=_article(article_id)),
        patch.object(Article, "patch", return_value=_article(article_id)) as patch_article,
        patch("libs.articles.api.context_db") as context,
        patch("libs.articles.api.Conversation") as conversation_class,
    ):
        context.return_value.__enter__.return_value.query.return_value.filter.return_value.all.return_value = [conversation]
        response = client.post(f"/api/articles/admin/{article_id}/state", json={"state": None})

    assert response.json()["error"] is None
    assert patch_article.call_args.kwargs["update_dict"] == {"state": None}
    assert conversation_class.patch.call_args.kwargs["update_dict"] == {"status": "active"}


def test_only_an_admin_may_archive() -> None:
    _set_non_admin_dependency()

    with patch.object(Article, "patch") as patch_article:
        response = client.post(f"/api/articles/admin/{uuid.uuid4()}/state", json={"state": "archived"})

    assert response.json()["error"]["code"] == "Unauthorized"
    patch_article.assert_not_called()


def test_an_article_is_either_live_or_archived() -> None:
    _set_admin_dependency()

    with patch.object(Article, "patch") as patch_article:
        response = client.post(f"/api/articles/admin/{uuid.uuid4()}/state", json={"state": "deleted"})

    assert response.json()["error"]["code"] == "invalid_state"
    patch_article.assert_not_called()
