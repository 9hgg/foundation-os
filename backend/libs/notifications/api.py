from fastapi import status

from libs.acl.methods import cannot
from libs.acl.models import Acl, Operation, Who
from libs.db.methods import context_db
from libs.endpoints import create_crud_endpoints
from libs.endpoints.endpoints import add_acl_filters
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .models import Notification


def create_crud_notification_router(prefix: str = "/api/notifications"):
    """
    Create a CRUD router for notifications with custom endpoints.
    """
    # custom endpoints for Notification to check author_id
    crud_notification_router = create_crud_endpoints(
        Notification,
        prefix=prefix,
        tags=["notifications"],
        include_read=True,  # to bypass: reading notifications needs to know if the conversation target is readable
        include_create=False,  # to bypass: creating notifications needs to check author_id
        include_update=False,  # to bypass: updating notifications needs to check author_id
        include_delete=False,
    )

    @crud_notification_router.post("/read/all", status_code=status.HTTP_200_OK)
    def mark_all_notifications_read(
        classic_deps: ClassicDeps__dep,
    ):
        """
        Change the read status on all notifications.
        """
        current_user_db, session, translator = classic_deps
        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate("You must be logged in to react to a notification."),
                    code="Unauthorized",
                )
            )
        # check if the user has notifications

        with context_db() as db:
            query = db.query(Notification)

            query = (
                query.join(Acl, Acl.resource_id == Notification.id)
                .filter(Acl.operation == Operation.READ.value)
                .filter(Acl.resource_kind == Notification.__kind__)
            )

            query = add_acl_filters(current_user_db, session, query)            # group by resource_id to avoid duplicates
            query = query.filter(Notification.read.is_(False))

            # Process in batches to handle large datasets efficiently
            batch_size = 1000  # Adjust based on your database limits
            updated_count = 0

            while True:
                # Get a batch of notification IDs
                batch_notifications = query.limit(batch_size).all()
                if not batch_notifications:
                    break

                notification_ids = [notif.id for notif in batch_notifications]

                # Update this batch
                db.query(Notification).filter(Notification.id.in_(notification_ids)).update(
                    {Notification.read: True}, synchronize_session=False
                )
                updated_count += len(notification_ids)

                # If we got fewer than batch_size, we're done
                if len(batch_notifications) < batch_size:
                    break

            db.commit()

    @crud_notification_router.post("/{notification_id}/read/toggle", status_code=status.HTTP_200_OK)
    def toggle_notification_read(
        notification_id: str,
        classic_deps: ClassicDeps__dep,
    ):
        """
        Toggle the read status on a notification.
        """
        current_user_db, session, translator = classic_deps

        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate("You must be logged in to react to a notification."),
                    code="Unauthorized",
                )
            )
        # check if notification exists
        notification_db = Notification.by_id(notification_id)
        if not notification_db:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not Found"),
                    description=translator.translate("Notification not found."),
                    code="NotFound",
                )
            )

        # check if the notification is readable by the user
        if cannot(
            who_id=current_user_db.id if current_user_db else None,
            resource_type=Notification,
            resource_id=notification_id,
            what=Operation.READ,
            who=Who.user,
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate("You cannot read this notification"),
                    code="access_denied",
                    details={
                        "notification_id": notification_id,
                    },
                )
            )

        notification_db.read = not notification_db.read

        notification_db = Notification.update(obj_id=notification_id, new_obj=notification_db)

        # return the updated notification
        return EndpointOutput(result={"notification": notification_db})

    @crud_notification_router.post("/{notification_id}/archived/toggle", status_code=status.HTTP_200_OK)
    def toggle_notification_archived(
        notification_id: str,
        classic_deps: ClassicDeps__dep,
    ):
        """
        Toggle the archived status on a notification.
        """
        current_user_db, session, translator = classic_deps

        if current_user_db is None:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Unauthorized"),
                    description=translator.translate("You must be logged in to react to a notification."),
                    code="Unauthorized",
                )
            )
        # check if notification exists
        notification_db = Notification.by_id(notification_id)
        if not notification_db:
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Not Found"),
                    description=translator.translate("Notification not found."),
                    code="NotFound",
                )
            )

        # check if the notification is readable by the user
        if cannot(
            who_id=current_user_db.id if current_user_db else None,
            resource_type=Notification,
            resource_id=notification_id,
            what=Operation.READ,
            who=Who.user,
        ):
            return EndpointOutput(
                error=EndpointError(
                    title=translator.translate("Access denied"),
                    description=translator.translate("You cannot read this notification"),
                    code="access_denied",
                    details={
                        "notification_id": notification_id,
                    },
                )
            )

        notification_db.archived = not notification_db.archived

        notification_db.save()

        # notification_db = Notification.update(obj_id=notification_id, new_obj=notification_db)

        # return the updated notification
        return EndpointOutput(result={"notification": notification_db})

    return crud_notification_router
