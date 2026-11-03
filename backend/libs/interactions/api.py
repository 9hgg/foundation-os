from datetime import timedelta
from typing import TypedDict

from pydantic import BaseModel

import libs.utils.tokens
from libs.db import context_db
from libs.endpoints import create_crud_endpoints
from libs.endpoints.endpoints import get_resource_if_WRITE_allowed
from libs.resource.resource import ResourceManager
from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError, EndpointOutput

from .methods import _get_interactions_for
from .methods import get_interaction_by_token as _get_interaction_by_token
from .models import Interaction


class InteractionAndToken(TypedDict):
    interactionToken: str
    interaction: Interaction


class SetInteractionStateRequest(BaseModel):
    state: str | None = None


def create_crud_interaction_router(prefix: str = "/api/interactions"):  # noqa: C901
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

    @crud_interaction_router.post("/{interaction_id}/state")
    async def set_interaction_state(
        interaction_id: str,
        body: SetInteractionStateRequest,
        classic_deps: ClassicDeps__dep,
    ) -> EndpointOutput[Interaction]:
        """Set a host-side lifecycle marker ('archived' hides, 'deleted' also releases the
        storage its files were counting for; None restores.
        Interactions carry no ACLs, so authorization is deferred to the parent resource named
        in the key ('{kind}.{id}', e.g. 'form.<uuid>'): the caller must have WRITE on it."""
        current_user_db, session_db, translator = classic_deps

        if body.state not in (None, "archived", "deleted"):
            return EndpointOutput(error=EndpointError(title=translator.translate("Invalid state"), code="invalid_state"))

        interaction = Interaction.by_id(obj_id=interaction_id)
        if interaction is None or not interaction.key:
            return EndpointOutput(error=EndpointError(title=translator.translate("Interaction not found")))

        kind, _, resource_id = interaction.key.partition(".")
        if not kind or not resource_id or get_resource_if_WRITE_allowed(current_user_db, session_db, kind, resource_id) is None:
            return EndpointOutput(error=EndpointError(title=translator.translate("Access denied"), code="access_denied"))

        updated = Interaction.patch(obj_id=interaction_id, update_dict={"state": body.state})
        return EndpointOutput(result=updated)

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
        if interaction_update.key and "." in interaction_update.key:
            parts = interaction_update.key.split(".", 1)
            item_kind = parts[0]
            item_id = parts[1]

        ResourceItemType = None
        item_db = None

        if item_kind and ResourceManager.is_resource_registered(item_kind):
            ResourceItemType = ResourceManager.get_resource_by_kind(item_kind)
            item_db = ResourceItemType.by_id(item_id)
            if not item_db:
                return EndpointOutput(
                    error=EndpointError(title=f"{item_kind} ({item_id}) not found")
                )
            print(
                f"[update_interaction_by_token_route] Found item: {item_db.id} of kind {item_kind}"
            )
        elif item_kind:
            print(
                f"[update_interaction_by_token_route] Resource kind '{item_kind}' is not registered, skipping resource lookup"
            )

        # A guest answering into an archived or deleted session brings it back (see /{id}/state
        # for the host-side marker). Neither may silently swallow new answers: the host puts a
        # response away, the respondent keeps going, and their answers would otherwise land in a
        # row the host cannot see and look lost. The guest's browser holds their answers, so this
        # is what a returning respondent actually does. Any other state a guest save cannot set.
        interaction_update.state = None if interaction_db.state in ("archived", "deleted") else interaction_db.state

        updated_interaction = interaction_db.update(
            obj_id=interaction_db.id, new_obj=interaction_update
        )

        print(
            f"[update_interaction_by_token_route] Updated interaction: {updated_interaction.id}"
        )

        if ResourceItemType and item_db and ResourceItemType.__notify_method__:
            print(
                f"[update_interaction_by_token_route] Notifying for item: {item_db.id} of kind {item_kind}"
            )
            ResourceItemType.__notify_method__(
                resource_id=item_db.id,
                current_user_db=current_user_db,
                interaction_db=updated_interaction,
            )
        elif ResourceItemType:
            print(
                f"[update_interaction_by_token_route] No notify method defined for {item_kind}, skipping notification."
            )

        return EndpointOutput(result=updated_interaction)

    @crud_interaction_router.get("/by-key/{key:path}")
    async def get_interactions_by_key(
        key: str,
        classic_deps: ClassicDeps__dep,
    ) -> EndpointOutput[list[Interaction]]:
        current_user_db, session, translator = classic_deps

        if not current_user_db or not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="Admin access required",
                    code="unauthorized",
                )
            )

        with context_db() as db:
            interactions = db.query(Interaction).filter(Interaction.key == key).all()
        return EndpointOutput(result=interactions)

    @crud_interaction_router.get("/by-key-prefix/{prefix:path}")
    async def get_interactions_by_key_prefix(
        prefix: str,
        classic_deps: ClassicDeps__dep,
    ) -> EndpointOutput[list[Interaction]]:
        current_user_db, session, translator = classic_deps

        if not current_user_db or not current_user_db.is_admin():
            return EndpointOutput(
                error=EndpointError(
                    title="Not authorized",
                    description="Admin access required",
                    code="unauthorized",
                )
            )

        with context_db() as db:
            # Escape LIKE pattern special characters to prevent injection via wildcards
            safe_prefix = prefix.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            interactions = (
                db.query(Interaction)
                .filter(Interaction.key.like(f"{safe_prefix}%", escape="\\"))
                .order_by(Interaction.time_created.desc())
                .all()
            )
        return EndpointOutput(result=interactions)

    @crud_interaction_router.post("/by-user/get-or-create")
    async def get_or_create_interaction_for_user(
        data: dict,
        classic_deps: ClassicDeps__dep,
    ) -> EndpointOutput[InteractionAndToken]:
        current_user_db, _, _ = classic_deps

        if not current_user_db:
            return EndpointOutput(error=EndpointError(title="Authentication required"))

        key = data.get("key")
        if not key:
            return EndpointOutput(error=EndpointError(title="key is required"))

        # A signed-in respondent starting a new response asks for a fresh one explicitly: the
        # lookup below would otherwise hand back the session they just submitted (this endpoint is
        # get-*or*-create by design), and dropping the local token cannot help since the server
        # resolves it from the user + key.
        force_new = bool(data.get("forceNew") or data.get("force_new"))

        with context_db() as db:
            interaction_db = (
                None
                if force_new
                else db.query(Interaction)
                .filter(Interaction.key == key, Interaction.user_id == current_user_db.id)
                .first()
            )

            if not interaction_db:
                interaction_db = Interaction(key=key, user_id=current_user_db.id)
                db.add(interaction_db)
                db.commit()
                db.refresh(interaction_db)

            interaction_token = libs.utils.tokens.create_jwt_token(
                token_context_key="interaction",  # noqa: S106
                subject=interaction_db.id,
                expires_delta=timedelta(days=365),
            )
            return EndpointOutput(
                result={
                    "interaction": interaction_db,
                    "interactionToken": interaction_token,
                }
            )

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
