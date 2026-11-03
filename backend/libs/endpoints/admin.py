"""The admin check an endpoint runs before anything else.

A route that needs more than the resource's ACLs is still that resource's route -- it lives in its
`libs/{resource}/api.py`, and the only thing that makes it different is this call, first, in the
body. Here so that every such route says it the same way, and says it with `is_admin()` rather than
re-deriving what an admin is.
"""

from libs.utils.deps import ClassicDeps__dep
from libs.utils.types import EndpointError


def require_admin(classic_deps: ClassicDeps__dep):
    """`(user, None)` for a verified admin, `(None, error)` for anyone else.

    `is_admin()` already requires a verified email, so this is one check, not two.
    """
    current_user_db, _session, translator = classic_deps
    if not current_user_db or not current_user_db.is_admin():
        return None, EndpointError(
            title=translator.translate("Not authorized"),
            description=translator.translate("You must be a verified admin to do this."),
            code="not_authorized",
        )
    return current_user_db, None
