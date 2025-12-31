import sqlalchemy as sa
from jose import jwt
from jose.exceptions import JWTError
from pydantic import ValidationError
from rich import print

from libs.acl.models import Acl, Operation
from libs.db import context_db
from libs.endpoints.endpoints import add_acl_filters
from libs.logger import print_error
from libs.resource.resource import Resource
from libs.sessions.models import AppSession
from libs.users.models import User
from libs.utils import tokens

from .config import INTERACTIONS_SETTINGS
from .models import Interaction


def _get_interactions_for(
    user: User | None,
    session: AppSession | None,
    ResourceType: type[Resource]
):
    with context_db() as db:
        query = db.query(ResourceType, Acl, Interaction)

        query = (
            query.join(Acl, Acl.resource_id == ResourceType.id)
            .filter(Acl.operation == Operation.READ.value)
            .filter(Acl.resource_kind == ResourceType.__kind__)
        )

        query = add_acl_filters(user, session, query)

        # the interaction.key property is
        # actually a string built like this : "item.<item_id>"

        query = query.join(
            Interaction,
            ResourceType.id == sa.func.split_part(Interaction.key, ".", 2).cast(sa.UUID),
        )
        result = query.all()

    restructured_result = {}
    # regroup by item id with the item as first property and interactions as a list
    for r in result:
        item_id = r[0].id
        if item_id not in restructured_result:
            restructured_result[item_id] = {"item": r[0], "interactions": []}
        restructured_result[item_id]["interactions"].append(r[2])


    return restructured_result


def get_interaction_by_token(interactionToken: str | None) -> Interaction | None:
    if not interactionToken:
        print("[interactions.methods.py](get_interaction_by_token) no interactionToken")
        return None
    try:
        payload = jwt.decode(
            interactionToken,
            INTERACTIONS_SETTINGS.APP_SECRET + "interaction",
            algorithms=[tokens.TOKENS_SETTINGS.encoding_algorithm],
            options={"verify_exp": False},  # TODO set to True later
        )
    except (JWTError, ValidationError) as e:
        print_error(
            "[interactions.methods.py](get_interaction_by_token) JWTError",
            interactionToken,
            e,
        )
        return None
    sub = payload.get("sub", None)
    print("[interactions.methods.py](get_interaction_by_token) sub:", sub)
    if sub is None:
        return None
    interaction_db: Interaction | None = Interaction.by_id(sub)
    return interaction_db
