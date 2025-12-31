from datetime import timedelta
from typing import TypedDict

import libs.utils.tokens
from libs.db import context_db
from libs.endpoints import create_crud_endpoints
from libs.resource.resource import ResourceManager
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .methods import _get_interactions_for
from .methods import get_interaction_by_token as _get_interaction_by_token
from .models import Interaction


class InteractionAndToken(TypedDict):
    interactionToken: str
    interaction: Interaction


def create_crud_interaction_router(prefix: str = "/api/interactions"):
    crud_interaction_router = create_crud_endpoints(
        Interaction,
        prefix=prefix,
        tags=["interactions"],
        include_create=True,
        include_update=True,
    )

    @crud_interaction_router.get("/by/{resource_kind}")
    async def get_interactions_by_items(
        classic_deps: ClassicDeps__dep,
        resource_kind: str,
    ):
        current_user_db, session, translator = classic_deps
        ResourceType = ResourceManager.get_resource_by_kind(resource_kind)
        interactions = _get_interactions_for(current_user_db, session, ResourceType)
        print(
            f"[get_interactions_by_items] Found {len(interactions)} interactions for resource kind '{resource_kind}'"
        )
        return EndpointOutput(result=interactions)

    @crud_interaction_router.get("/by-token/{interactionToken}")
    async def get_interaction_by_token(
        interactionToken: str | None,
    ) -> EndpointOutput[Interaction]:
        interaction = _get_interaction_by_token(interactionToken)
        if not interaction:
            return EndpointOutput(error=EndpointError(title="Interaction not found"))

        return EndpointOutput(result=interaction)

    @crud_interaction_router.put("/by-token/{interactionToken}")
    async def update_interaction_by_token_route(
        interactionToken: str | None,
        interaction_update: Interaction,
        classic_deps: ClassicDeps__dep,
    ) -> EndpointOutput[Interaction]:

        interaction_db = _get_interaction_by_token(interactionToken)

        if not interaction_db:
            return EndpointOutput(error=EndpointError(title="Interaction not found"))

        print(
            "Updating interaction:", interaction_db.id, "with data:", interaction_update
        )

        current_user_db, session_db, translator = classic_deps

        item_kind = None
        item_id = None
        if "." in interaction_update.key:
            item_kind = interaction_update.key.split(".")[0]
            item_id = interaction_update.key.split(".")[1]

        ResourceItemType = ResourceManager.get_resource_by_kind(item_kind)

        item_db = ResourceItemType.by_id(item_id)  # Ensure the item exists
        if not item_db:
            return EndpointOutput(
                error=EndpointError(title=f"{item_kind} ({item_id}) not found")
            )

        print(
            f"[update_interaction_by_token_route] Found item: {item_db.id} of kind {item_kind}"
        )

        updated_interaction = interaction_db.update(
            obj_id=interaction_db.id, new_obj=interaction_update
        )

        print(
            f"[update_interaction_by_token_route] Updated interaction: {updated_interaction.id}"
        )

        if ResourceItemType.__notify_method__:
            print(
                f"[update_interaction_by_token_route] Notifying for item: {item_db.id} of kind {item_kind}"
            )
            ResourceItemType.__notify_method__(
                resource_id=item_db.id,
                current_user_db=current_user_db,
                interaction_db=updated_interaction,
            )
        else:
            print(
                f"[update_interaction_by_token_route] No notify method defined for {item_kind}, skipping notification."
            )

        return EndpointOutput(result=updated_interaction)

    @crud_interaction_router.post("/by-token/create")
    async def create_interaction_by_token_route(
        data: dict,
    ) -> EndpointOutput[InteractionAndToken]:
        key = data.get("key")

        with context_db() as db:
            interaction_db = Interaction(key=key)
            db.add(interaction_db)
            db.commit()

            interaction_token = libs.utils.tokens.create_jwt_token(
                token_context_key="interaction",  # noqa: S106
                subject=interaction_db.id,
                expires_delta=timedelta(days=100),
            )
            return EndpointOutput(
                result={
                    "interaction": interaction_db,
                    "interactionToken": interaction_token,
                }
            )

    return crud_interaction_router
