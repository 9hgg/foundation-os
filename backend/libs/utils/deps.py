from typing import TYPE_CHECKING, Annotated, Optional

from fastapi import Depends, Request

if TYPE_CHECKING:
    from libs.i18n.models import SimpleTranslator
    from libs.sessions.models import AppSession
    from libs.users.models import User


def get_deps(request: Request):
    user: User | None = request.state.user
    session: AppSession | None = request.state.session
    translator: SimpleTranslator = request.state.translator
    return user, session, translator


# The user is None on anonymous requests -- every endpoint's `if current_user_db is None`
# check is real, and the type must say so. The translator always resolves (Translator__dep
# falls back to a default language), so it stays required.
ClassicDeps__dep = Annotated[
    tuple[Optional["User"], Optional["AppSession"], "SimpleTranslator"],
    Depends(get_deps),
]
