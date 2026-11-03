import uuid
from unittest.mock import MagicMock, patch

from libs.acl.models import Who
from libs.notifications.methods import _format_notification_for_digest, _send_digest_email, notify_to_writers


@patch("libs.notifications.methods.notify")
@patch("libs.notifications.methods.User")
@patch("libs.notifications.methods.get_user_writers")
@patch("libs.notifications.methods.ResourceManager")
def test_notify_to_writers_logs_without_raising_for_a_real_writer(mock_resource_manager, mock_get_user_writers, mock_user_cls, mock_notify):
    """Regression test: the loop used to call logger.info("Key for writer:", for_key)
    -- structlog treats a bare second positional arg as a %-interpolation
    argument, and the event string has no %s, so this raised TypeError for
    every writer notified (i.e. whenever the resource has any writer besides
    the current user -- e.g. an admin replying to someone else's support
    ticket), even though the message being replied to had already committed."""
    mock_resource_manager.get_resource_by_kind.return_value.by_id.return_value = MagicMock()

    writer_acl = MagicMock()
    writer_acl.who = Who.user
    writer_acl.who_id = uuid.uuid4()
    mock_get_user_writers.return_value = [writer_acl]
    mock_user_cls.by_id.return_value = MagicMock()

    current_user = MagicMock()
    current_user.id = uuid.uuid4()  # different from writer_acl.who_id

    notify_to_writers(
        resource_id=uuid.uuid4(),
        resource_kind="article",
        current_user_db=current_user,
        config={},
        kind="comment",
        content="A comment",
        for_key="conversation_abc",
    )

    mock_notify.assert_called_once()


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

    notif.kind = "interaction.form"
    notif.config.interaction_details = {"nbStepsSeen": 3, "nbTotalSteps": 7}
    assert _format_notification_for_digest(notif) == "New form response (3/7 steps answered)"

    # Ticket and feature request: same shape, different news. Both name the author, which the
    # generic fallback never did -- it printed the stored content and left you guessing who.
    notif.kind = "ticket"
    with patch("libs.notifications.methods._get_user_display_info") as mock_info:
        mock_info.return_value = ("User 1", "")
        assert _format_notification_for_digest(notif) == "New ticket by User 1"

    notif.kind = "feature_request"
    with patch("libs.notifications.methods._get_user_display_info") as mock_info:
        mock_info.return_value = ("User 1", "")
        assert _format_notification_for_digest(notif) == "New feature request by User 1"

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
