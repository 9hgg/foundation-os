"""The invitation mail, checked where it can go wrong: the link inside it."""

import uuid
from unittest.mock import MagicMock, patch

import pytest

from libs.teams.invitations import mint_invitation, read_link_token
from libs.teams.mails import send_invitation_email

TEAM_ID = uuid.UUID("11111111-2222-3333-4444-555555555555")


@pytest.fixture
def sent():
    """Everything the mail was built with, without a database or a worker in the way."""
    captured = {}

    def capture(**kwargs):
        captured.update(kwargs)
        return MagicMock(id=uuid.uuid4())

    translator = MagicMock()
    translator.translate.side_effect = lambda text: text

    with (
        patch("libs.teams.mails.add_mail_to_db", side_effect=capture),
        patch("libs.teams.mails.mail_task_description"),
        patch("libs.teams.mails.TasksManager"),
        patch("libs.teams.mails.run_task_here"),
    ):
        _, token = mint_invitation(email="new@example.test", role="member")
        send_invitation_email(
            recipient_email="new@example.test",
            team_id=TEAM_ID,
            team_name="Studio",
            role="member",
            token=token,
            invited_by_name="Alex Ferry",
            frontend_url="https://app.example.test",
            translator=translator,
        )
    captured["token"] = token
    return captured


def test_it_goes_to_the_address_that_was_invited(sent):
    assert sent["recipient_emails"] == ["new@example.test"]


def test_the_link_is_one_the_join_page_can_spend(sent):
    expected = f"https://app.example.test/host/teams/join?token={TEAM_ID}.{sent['token']}"

    assert expected in sent["text_content"]
    assert expected in sent["html_content"]
    assert read_link_token(f"{TEAM_ID}.{sent['token']}") == (TEAM_ID, sent["token"])


def test_it_says_which_team_and_who_is_asking(sent):
    assert "Studio" in sent["subject"]
    assert "Alex Ferry" in sent["html_content"]
