import pytest
from unittest.mock import MagicMock, patch
from libs.notifications.methods import _format_notification_for_digest, _send_digest_email
from libs.notifications.models import Notification
from libs.users.models import User


def test_format_notification_for_digest():
    # Reaction
    notif = MagicMock()
    notif.kind = "reaction"
    notif.config = MagicMock()
    notif.config.user_id = "user1"
    notif.config.emoji = "👍"

    with patch("libs.notifications.methods._get_user_display_info") as mock_info:
        mock_info.return_value = ("User 1", "user1@example.com")
        assert 'User 1 (user1@example.com) reacted with "👍"' in _format_notification_for_digest(notif)

        mock_info.return_value = ("User 1", "")
        assert 'User 1 reacted with "👍"' in _format_notification_for_digest(notif)

    # Comment
    notif.kind = "comment"
    with patch("libs.notifications.methods._get_user_display_info") as mock_info:
        mock_info.return_value = ("User 1", "")
        assert "New comment by User 1" in _format_notification_for_digest(notif)

    # Reply
    notif.kind = "reply"
    with patch("libs.notifications.methods._get_user_display_info") as mock_info:
        mock_info.return_value = ("User 1", "")
        assert "New reply by User 1" in _format_notification_for_digest(notif)

    # Interview
    notif.kind = "interaction.interview"
    notif.config.interaction_details = {"nbStepsSeen": 5, "nbTotalSteps": 10}
    assert "New interview interaction (5/10 steps completed)" in _format_notification_for_digest(notif)

    # Default
    notif.kind = "other"
    notif.content = "Some content"
    assert "Some content" in _format_notification_for_digest(notif)


@patch("libs.notifications.methods.add_mail_to_db")
@patch("libs.notifications.methods.TasksManager.create_task")
def test_send_digest_email(mock_create_task, mock_add_mail):
    user = MagicMock()
    user.email = "user@example.com"

    notif1 = MagicMock()
    notif1.kind = "reaction"
    notif1.config.user_id = "u1"

    notif2 = MagicMock()
    notif2.kind = "comment"
    notif2.config.user_id = "u2"

    notifications = [notif1, notif2]

    with patch("libs.notifications.methods._get_user_display_info") as mock_info:
        mock_info.return_value = ("User", "")

        # Dry run
        _send_digest_email(user, notifications, "daily", dry=True)
        mock_add_mail.assert_not_called()

        # Real run
        _send_digest_email(user, notifications, "daily", dry=False)
        mock_add_mail.assert_called_once()
        mock_create_task.assert_called_once()
