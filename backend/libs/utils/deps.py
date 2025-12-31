from typing import TYPE_CHECKING, Annotated, Optional

from fastapi import Depends, Request

if TYPE_CHECKING:
    from libs.i18n.models import SimpleTranslator
    from libs.sessions.models import AppSession
    from libs.users.models import User


def get_deps(request: Request):
    user: Optional[User] = request.state.user
    session: Optional[AppSession] | None = request.state.session
    translator: Optional[SimpleTranslator] | None = request.state.translator
    return user, session, translator


ClassicDeps__dep = Annotated[
    tuple["User", Optional["AppSession"], "SimpleTranslator"],
    Depends(get_deps),
]
