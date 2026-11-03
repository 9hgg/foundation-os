"""What the three invitation endpoints promise, at the door rather than inside the module."""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from libs.teams.api import create_crud_team_router
from libs.teams.invitations import link_token, mint_invitation
from libs.teams.models import Team, TeamConfig
from libs.utils.deps import get_deps

app = FastAPI()
app.include_router(create_crud_team_router())

TEAM_ID = uuid.UUID("11111111-2222-3333-4444-555555555555")


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def translator():
    translator = MagicMock()
    translator.translate.side_effect = lambda text: text
    return translator


@pytest.fixture
def signed_in(translator):
    """Somebody with an account, wired in as the caller, and allowed to write over the team."""
    user = MagicMock()
    user.id = uuid.uuid4()
    user.email = "invited@example.test"
    user.first_name = "Alex"
    user.last_name = "Ferry"
    user.pseudo = None
    app.dependency_overrides[get_deps] = lambda: (user, None, translator)
    with patch("libs.teams.api.cannot", return_value=False):
        yield user
    app.dependency_overrides = {}


def invitation_hash_of(saved):
    return next(iter(saved["invitations"].values())).token_hash


def team_with(invitations=None):
    return Team(
        id=TEAM_ID,
        name="Studio",
        owner_id=uuid.uuid4(),
        config=TeamConfig(invitations=invitations or {}),
    )


def test_an_address_that_already_has_an_account_is_invited_not_added(client, signed_in):
    """The behaviour change: knowing somebody's address is not their consent to join."""
    saved, sent = {}, {}

    with (
        patch.object(Team, "by_id", return_value=team_with()),
        patch("libs.teams.api.User.get_first_by", return_value=MagicMock(id=uuid.uuid4())),
        patch("libs.teams.api.context_db") as context,
        patch("libs.teams.api.add_to_team") as add_to_team,
        patch("libs.teams.api.set_team_invitations", side_effect=lambda **kw: saved.update(kw)),
        patch("libs.teams.api.send_invitation_email", side_effect=lambda **kw: sent.update(kw)),
    ):
        context.return_value.__enter__.return_value.query.return_value.filter.return_value.first.return_value = None
        response = client.post(
            f"/api/teams/{TEAM_ID}/invitations",
            json={"email": "New@Example.test", "role": "admin"},
        )

    assert response.status_code == 200
    assert response.json()["result"]["email"] == "new@example.test"
    assert invitation_hash_of(saved) not in response.text, "the hash never leaves in a reply"
    add_to_team.assert_not_called()
    assert sent["recipient_email"] == "new@example.test"
    assert len(saved["invitations"]) == 1


def test_re_inviting_refreshes_the_one_invitation_instead_of_adding_another(client, signed_in):
    existing, _ = mint_invitation(email="new@example.test", role="member")
    saved, sent = {}, {}

    with (
        patch.object(Team, "by_id", return_value=team_with({existing.id: existing})),
        patch("libs.teams.api.User.get_first_by", return_value=None),
        patch("libs.teams.api.set_team_invitations", side_effect=lambda **kw: saved.update(kw)),
        patch("libs.teams.api.send_invitation_email", side_effect=lambda **kw: sent.update(kw)),
    ):
        response = client.post(
            f"/api/teams/{TEAM_ID}/invitations",
            json={"email": "new@example.test", "role": "admin"},
        )

    assert response.status_code == 200
    assert list(saved["invitations"]) == [existing.id]
    assert saved["invitations"][existing.id].role == "admin"
    assert saved["invitations"][existing.id].token_hash != existing.token_hash


def test_somebody_already_in_the_team_is_refused(client, signed_in):
    with (
        patch.object(Team, "by_id", return_value=team_with()),
        patch("libs.teams.api.User.get_first_by", return_value=MagicMock(id=uuid.uuid4())),
        patch("libs.teams.api.context_db") as context,
        patch("libs.teams.api.send_invitation_email") as send,
    ):
        context.return_value.__enter__.return_value.query.return_value.filter.return_value.first.return_value = MagicMock()
        response = client.post(
            f"/api/teams/{TEAM_ID}/invitations",
            json={"email": "member@example.test", "role": "member"},
        )

    assert response.json()["error"]["code"] == "user_already_in_team"
    send.assert_not_called()


def test_revoking_removes_it(client, signed_in):
    invitation, _ = mint_invitation(email="new@example.test", role="member")
    saved = {}

    with (
        patch.object(Team, "by_id", return_value=team_with({invitation.id: invitation})),
        patch("libs.teams.api.set_team_invitations", side_effect=lambda **kw: saved.update(kw)),
    ):
        response = client.post(f"/api/teams/{TEAM_ID}/invitations/{invitation.id}/revoke")

    assert response.status_code == 200
    assert saved["invitations"] == {}


def test_claiming_grants_the_role_the_invitation_carries_now(client, signed_in):
    """Not the role the token was minted with -- an admin may have changed their mind since."""
    invitation, token = mint_invitation(email="invited@example.test", role="member")
    invitation = invitation.model_copy(update={"role": "admin"})
    saved = {}

    with (
        patch.object(Team, "by_id", return_value=team_with({invitation.id: invitation})),
        patch("libs.teams.api.add_to_team") as add_to_team,
        patch("libs.teams.api.create_default_acls_by_id") as create_acls,
        patch("libs.teams.api.set_team_invitations", side_effect=lambda **kw: saved.update(kw)),
    ):
        response = client.post(
            "/api/teams/invitations/claim",
            json={"token": link_token(TEAM_ID, token)},
        )

    assert response.json()["result"]["role"] == "admin"
    assert add_to_team.call_args.kwargs["role"] == "admin"
    assert create_acls.call_args.kwargs["create_write_acl"] is True
    assert saved["invitations"] == {}, "a claimed invitation is spent"


def test_claiming_from_another_address_is_refused(client, signed_in):
    invitation, token = mint_invitation(email="somebody.else@example.test", role="member")

    with (
        patch.object(Team, "by_id", return_value=team_with({invitation.id: invitation})),
        patch("libs.teams.api.add_to_team") as add_to_team,
    ):
        response = client.post(
            "/api/teams/invitations/claim",
            json={"token": link_token(TEAM_ID, token)},
        )

    assert response.json()["error"]["code"] == "invitation_other_email"
    add_to_team.assert_not_called()


@pytest.mark.parametrize(
    "token",
    [
        "nonsense",
        f"{TEAM_ID}.wrong-secret",
        f"{uuid.uuid4()}.{uuid.uuid4()}",
    ],
)
def test_every_way_a_link_can_fail_gives_the_same_answer(client, signed_in, token):
    """A stranger holding a token learns nothing about which teams or invitations exist."""
    with (
        patch.object(Team, "by_id", return_value=team_with()),
        patch("libs.teams.api.add_to_team") as add_to_team,
    ):
        response = client.post("/api/teams/invitations/claim", json={"token": token})

    assert response.json()["error"]["code"] == "invitation_not_valid"
    add_to_team.assert_not_called()
