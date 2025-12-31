import datetime
import re
import textwrap
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, exists, or_
from sqlalchemy.orm import Session

from libs.acl.methods import create_default_acls, get_user_writers
from libs.acl.models import Acl, Operation, Who
from libs.db import context_db
from libs.logger.customLogger import print
from libs.mails.methods import add_mail_to_db
from libs.mails.template_utils import render_transactional_email
from libs.resource import Resource, ResourceManager
from libs.tasks.tasks_manager import TasksManager
from libs.users.methods import _get_user_display_info
from libs.users.models import User

from .models import Notification


def _create_notification(
    *,
    title: Optional[str],
    content: Optional[str],
    target_id: str | UUID | None,
    target_kind: Optional[str],
    kind: str = "default",
    read: bool = False,
    config: dict | None = None,
    for_key: str | None = None,
    _db: Session | None = None,
):
    if config is None:
        config = {}
    if isinstance(target_id, UUID):
        target_id = str(target_id)
    notification_db = Notification.create(
        obj_dict={
            "kind": kind,
            "read": read,
            "title": title,
            "content": content,
            "target_id": target_id,
            "target_kind": target_kind,
            "key": for_key,
            "config": config,
        },
        _db=_db,
    )
    return notification_db


def notify(
    *,
    user: User,
    title: str | None = None,
    content: str | None = None,
    kind: str = "default",
    read: bool = False,
    config: dict | None = None,
    resource: Resource | None,
    for_key: str | None = None,
    _db: Session | None = None,
):
    """
    Create a notification for a user.
    """

    if config is None:
        config = {}

    # # Send real-time notification
    # _send_realtime_notification(
    #     user_id=str(user.id),
    #     notification_data={
    #         "notification": {
    #             "title": title,
    #             "content": content,
    #             "kind": kind,
    #             "config": config,
    #         }
    #     }
    # )

    if for_key:
        print("Looking for interaction with key:", for_key)
        notification_db = Notification.get_first_by(
            key=for_key,
            _db=_db,
        )
        if notification_db:
            print("Notification already exists for key:", for_key)
            notification_db.title = title
            notification_db.content = content
            notification_db.read = False
            notification_db.archived = False
            notification_db.target_id = str(resource.id) if resource else None
            notification_db.target_kind = resource.__kind__ if resource else None
            notification_db.kind = kind
            notification_db.config = config
            notification_db.time_created = datetime.datetime.now(datetime.timezone.utc)
            print("Updating existing notification:", notification_db)
            notification_db.save()

            return notification_db
        else:
            print("No existing notification found for key:", for_key)
    print("Creating new notification for key:", for_key)

    notification_db = _create_notification(
        title=title,
        content=content,
        target_id=str(resource.id) if resource else None,
        target_kind=resource.__kind__ if resource else None,
        read=read,
        kind=kind,
        config=config,
        for_key=for_key,
        _db=_db,
    )
    create_default_acls(
        resource=notification_db,
        who=Who.user,
        who_id=user.id,
        create_delete_acl=False,
        create_write_acl=False,
        create_read_acl=True,
        _db=_db,
    )

    return notification_db


def notify_to_writers(
    #
    *,
    resource_id: str | UUID | None,
    resource_kind: str | None,
    current_user_db: User | None,
    config: dict | None = None,
    kind: str = "default",
    content: str | None = None,
    include_admins: bool = False,
    for_key: str | None = None,
):
    resource_type = ResourceManager.get_resource_by_kind(resource_kind)
    resource_db = resource_type.by_id(resource_id) if resource_id else None

    resource_write_acls = (
        get_user_writers(
            resource_id=resource_id,
            resource_kind=resource_kind,
            include_admins=include_admins,
        )
        if resource_kind and resource_id
        else []
    )
    # for acl in resource_write_acls:
    #     print("ACL:", acl)

    # notify the resource WRITER(s)
    for acl in resource_write_acls:
        if current_user_db and str(acl.who_id) == str(current_user_db.id):
            # skip the current user
            continue

        if acl.who == Who.admin:
            # notify joris@spoken.systems
            admin = User.get_first_by(email="joris@spoken.systems")
            if admin:
                if current_user_db and admin.id == current_user_db.id:
                    continue

                notify(
                    resource=resource_db,
                    config=config,
                    kind=kind,
                    content=content,
                    user=admin,  # <= notify the admin
                    for_key="user:" + str(admin.id) + ("_" + for_key if for_key else ""),
                )
            continue

        resource_writer_db = User.by_id(acl.who_id) if acl.who_id else None
        if not resource_writer_db:
            continue

        print("Key for writer:", for_key)
        notify(
            resource=resource_db,
            config=config,
            kind=kind,
            content=content,
            user=resource_writer_db,  # <= notify the writer of the resource
            for_key="user:" + str(resource_writer_db.id) + ("_" + for_key if for_key else ""),
        )


def list_notifications(
    *,
    user: User,
    read: bool = False,
    archived: bool = False,
    _db: Session | None = None,
):
    """
    List notifications for a user.
    """
    notifications = Notification.get_all_by(
        user=user,
        read=read,
        archived=archived,
        _db=_db,
    )
    return notifications


def notification_digests(period: str, dry: bool = False):
    """
    Create and send notification digest emails for users with matching digest frequency.

    Args:
        period: The digest period ('hourly', 'daily', 'weekly', 'monthly')
        dry: If True, run in dry mode without actually sending emails
    """
    print(f"[notification_digests] Starting digest generation for period: {period} {'(DRY RUN)' if dry else ''}")

    if period not in ["hourly", "daily", "weekly", "monthly"]:
        print(f"[notification_digests] Invalid period: {period}. Must be 'hourly', 'daily', 'weekly', or 'monthly'")
        return

    # Calculate the time range for the digest
    now = datetime.datetime.now(datetime.timezone.utc)
    time_deltas = {
        "hourly": datetime.timedelta(hours=1),
        "daily": datetime.timedelta(days=1),
        "weekly": datetime.timedelta(weeks=1),
        "monthly": datetime.timedelta(days=30),
    }
    time_cutoff = now - time_deltas[period]

    with context_db() as db:
        # Query users with verified email and matching digest frequency
        # Use PostgreSQL-compatible JSON operations
        users_query = db.query(User).filter(
            and_(
                User.email.isnot(None),  # User has an email
                # User.email_verified,  # Email is verified
                User.config["notification_digest_frequency"].astext == period,  # Matching digest frequency
            )
        )

        users = users_query.all()
        print(f"[notification_digests] Found {len(users)} users with {period} digest frequency and verified emails")

        for user in users:
            _process_user_digest(db, user, time_cutoff, now, period, dry)

    print(f"[notification_digests] Completed digest generation for period: {period} {'(DRY RUN)' if dry else ''}")


def _process_user_digest(
    db: Session, user: User, time_cutoff: datetime.datetime, now: datetime.datetime, period: str, dry: bool = False
) -> None:
    """Process digest for a single user."""
    print(f"[notification_digests] Processing user: {user.email} {'(DRY RUN)' if dry else ''}")

    # Get user's notifications from the last period with ACL checking
    notifications_query = db.query(Notification).filter(
        and_(
            Notification.time_created >= time_cutoff,
            Notification.time_created <= now,
            Notification.read.is_(False),  # Only unread notifications
            Notification.archived.is_(False),  # Only active notifications
            # Check if user has read access to this notification via ACL
            exists().where(
                and_(
                    Acl.resource_id == Notification.id,
                    Acl.resource_kind == Notification.__kind__,
                    Acl.operation == Operation.READ.value,
                    or_(
                        and_(Acl.who == Who.user.value, Acl.who_id == user.id),
                        Acl.who == Who.connected.value,
                        Acl.who == Who.anonymous.value,
                    ),
                )
            ),
        )
    )

    notifications = notifications_query.all()
    print(f"[notification_digests] Found {len(notifications)} notifications for user {user.email}")

    if not notifications:
        print(f"[notification_digests] No notifications for user {user.email}, skipping {'(DRY RUN)' if dry else ''}")
        return

    # Send digest email
    _send_digest_email(user, notifications, period, dry)


def _format_notification_for_digest(notification: Notification) -> str:
    """Format a single notification for digest display, matching frontend display logic."""
    config = notification.config

    if notification.kind == "reaction":
        user_id = getattr(config, "user_id", None)
        emoji = getattr(config, "emoji", "👍")

        if user_id:
            display_name, starred_email = _get_user_display_info(user_id)
            user_display = f"{display_name} ({starred_email})" if starred_email else display_name
        else:
            user_display = "Unknown user"

        return f'{user_display} reacted with "{emoji}" to your content'

    elif notification.kind == "comment":
        user_id = getattr(config, "user_id", None)

        if user_id:
            display_name, starred_email = _get_user_display_info(user_id)
            user_display = f"{display_name} ({starred_email})" if starred_email else display_name
        else:
            user_display = "Unknown user"

        return f"New comment by {user_display}"

    elif notification.kind == "reply":
        user_id = getattr(config, "user_id", None)

        if user_id:
            display_name, starred_email = _get_user_display_info(user_id)
            user_display = f"{display_name} ({starred_email})" if starred_email else display_name
        else:
            user_display = "Unknown user"

        return f"New reply by {user_display}"

    elif notification.kind == "interaction.interview":
        interaction_details = getattr(config, "interaction_details", {})
        if interaction_details:
            steps_seen = interaction_details.get("nbStepsSeen", 0)
            total_steps = interaction_details.get("nbTotalSteps", 0)
            return f"New interview interaction ({steps_seen}/{total_steps} steps completed)"
        else:
            return "New interview interaction"

    else:
        # Fallback for unknown notification types
        return notification.content or notification.title or f"New {notification.kind} notification"


def _send_digest_email(user: User, notifications: list[Notification], period: str, dry: bool = False) -> None:
    """
    Build and send digest email for a user's notifications.

    Args:
        user: The user to send the digest to
        notifications: List of notifications to include in the digest
        period: The digest period ('hourly', 'daily', 'weekly', 'monthly')
        dry: If True, don't actually send the email, just simulate
    """
    # Group notifications by type for better email formatting
    notifications_by_type: dict[str, list[Notification]] = {}
    for notification in notifications:
        kind = notification.kind
        if kind not in notifications_by_type:
            notifications_by_type[kind] = []
        notifications_by_type[kind].append(notification)

    # Build email content
    period_display = period.capitalize()
    subject = f"{period_display} Digest"

    # Build detailed content with improved formatting
    content_parts = []

    # Sort notification types by priority (most important first)
    type_priority = {"interaction.interview": 1, "comment": 2, "reply": 3, "reaction": 4}

    sorted_types = sorted(notifications_by_type.items(), key=lambda x: type_priority.get(x[0], 99))

    for kind, kind_notifications in sorted_types:
        # Group header with cleaner names
        type_display_names = {
            "reaction": "Reactions",
            "comment": "Comments",
            "reply": "Replies",
            "interaction.interview": "Interview Interactions",
        }

        # Singular forms for when there's only 1 notification
        type_singular_names = {
            "reaction": "Reaction",
            "comment": "Comment",
            "reply": "Reply",
            "interaction.interview": "Interview Interaction",
        }

        kind_display = type_display_names.get(kind, kind.replace("_", " ").title())
        notification_plural = "s" if len(kind_notifications) != 1 else ""

        if len(kind_notifications) == 1:
            singular_display = type_singular_names.get(kind, kind_display.rstrip('s'))
            content_parts.append(f"**{singular_display}**")
        else:
            content_parts.append(f"**{kind_display}** ({len(kind_notifications)} notification{notification_plural})")

        # Show up to 3 notifications per type to keep digest concise
        displayed_notifications = kind_notifications[:3]
        for notification in displayed_notifications:
            formatted_message = _format_notification_for_digest(notification)
            content_parts.append(f"  • {formatted_message}")

        # Show count of remaining notifications if there are more than 3
        remaining_count = len(kind_notifications) - 3
        if remaining_count > 0:
            content_parts.append(f"  • ... and {remaining_count} more")

        content_parts.append("")  # Add blank line between sections

    # Add call to action
    content_parts.append("View all your notifications in spOken to stay up to date.")

    main_content = "\n".join(content_parts)

    # Generate HTML email using template
    notification_count = len(notifications)

    # Create better period descriptions for subtitle
    period_descriptions = {
        "hourly": "from the last hour",
        "daily": "from the last day",
        "weekly": "from the last week",
        "monthly": "from the last month"
    }
    period_text = period_descriptions.get(period, f"from the last {period}")

    # Convert markdown to HTML properly
    html_content_formatted = main_content.replace("\n", "<br>")
    # Convert **text** to <strong>text</strong> using regex
    html_content_formatted = re.sub(r'\*\*(.*?)\*\*', r'<strong>\1</strong>', html_content_formatted)

    html_content = render_transactional_email(
        title=subject,
        subtitle=f"You have {notification_count} notification{'s' if notification_count != 1 else ''} {period_text}",
        main_paragraph=html_content_formatted,
        button_text="View All Notifications",
        button_url="https://spoken.systems/host/dashboard",
        footer_message="This is your requested notification digest. "
        'You can change your digest frequency in your <a href="https://spoken.systems/host/dashboard/profile#notifications">profile settings</a>.',
    )

    # Create text version (fallback)
    text_content = textwrap.dedent(f"""
        {subject}

        {main_content}

        Visit https://spoken.systems/host/dashboard to see all your notifications.

        ---
        This is your requested notification digest. You can change your digest frequency in your profile settings.
        spOken - https://spoken.systems
    """).strip()

    # Add email to the queue (or simulate in dry mode)
    if dry:
        print(f"[notification_digests] DRY RUN - Would queue email for user {user.email}")
        print(f"[notification_digests] DRY RUN - Subject: {subject}")
        print(f"[notification_digests] DRY RUN - Notifications count: {len(notifications)}")
        print("[notification_digests] DRY RUN - Email content preview:")
        print(f"[notification_digests] DRY RUN - {main_content[:1000]}{'...' if len(main_content) > 1000 else ''}")
    else:
        try:
            mail = add_mail_to_db(
                sender_email="spOken nOtifications <notifications@spoken.systems>",
                recipient_emails=[user.email],
                subject=subject,
                text_content=text_content,
                html_content=html_content,
                priority=2,  # Medium priority for digest emails
            )

            TasksManager.create_task(
                title="send_email",
                custom_id=f"{mail.id}-0",
                method_name="send_email",
                description="Send template email",
                kwargs={
                    "mail_id": mail.id,
                },
            )
            print(f"[notification_digests] Email queued for user {user.email}: {mail.id}")

        except Exception as e:
            print(f"[notification_digests] Error queuing email for user {user.email}: {e}")
