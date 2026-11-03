"""Inviting somebody to a team, and letting them claim it.

Structurally a password reset: a secret goes out by email, only its hash is kept, and presenting
the secret proves you received the mail. The differences are all deliberate.

**The role is not in the token.** It lives on the invitation, so an admin can change what they are
offering after sending, and what the invitation says at the moment it is claimed is what is
granted.

**Only the hash is stored.** A team's config is readable by everyone already in the team, so a raw
token there would let any member claim somebody else's invitation, at whatever role it carried.

**It is bound to the address it was sent to.** Forwarding the mail does not transfer the offer;
the account claiming it has to be the one that was invited.
"""

import datetime
import hashlib
import secrets
import uuid

from libs.teams.models import TeamInvitation

#: Long enough that a week of guessing gets nowhere near it.
TOKEN_BYTES = 32

#: A week. Long enough to survive a holiday, short enough that a forgotten invitation lapses on its
#: own rather than sitting in a team's config forever.
INVITATION_LIFETIME = datetime.timedelta(days=7)


def hash_token(token: str) -> str:
    """What gets stored. Plain sha256: the token is 32 random bytes, so there is nothing to guess
    and nothing a slow hash would protect against."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def normalise_email(email: str) -> str:
    return email.strip().lower()


def mint_invitation(
    *,
    email: str,
    role: str,
    invited_by: str | None = None,
    now: datetime.datetime | None = None,
) -> tuple[TeamInvitation, str]:
    """A new invitation and the token to mail. The token is returned once and never stored."""
    moment = now or datetime.datetime.now(datetime.UTC)
    token = secrets.token_urlsafe(TOKEN_BYTES)
    invitation = TeamInvitation(
        id=str(uuid.uuid4()),
        email=normalise_email(email),
        role=role,
        token_hash=hash_token(token),
        invited_by=invited_by,
        created_at=moment.isoformat(),
        expires_at=(moment + INVITATION_LIFETIME).isoformat(),
    )
    return invitation, token


def refresh_invitation(
    invitation: TeamInvitation,
    *,
    role: str | None = None,
    now: datetime.datetime | None = None,
) -> tuple[TeamInvitation, str]:
    """Re-invite: a new token and a new week, keeping the invitation's identity.

    Rotating rather than adding means the previous mail stops working the moment a new one is
    sent, and a team never accumulates two live invitations for one address.
    """
    moment = now or datetime.datetime.now(datetime.UTC)
    token = secrets.token_urlsafe(TOKEN_BYTES)
    refreshed = invitation.model_copy(
        update={
            "token_hash": hash_token(token),
            "role": role or invitation.role,
            "created_at": moment.isoformat(),
            "expires_at": (moment + INVITATION_LIFETIME).isoformat(),
        }
    )
    return refreshed, token


def has_expired(invitation: TeamInvitation, *, now: datetime.datetime | None = None) -> bool:
    moment = now or datetime.datetime.now(datetime.UTC)
    expires_at = datetime.datetime.fromisoformat(invitation.expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=datetime.UTC)
    return moment > expires_at


def find_invitation(
    invitations: dict,
    token: str,
    *,
    now: datetime.datetime | None = None,
) -> TeamInvitation | None:
    """The live invitation this token opens, or None.

    Matched on the hash rather than by looking up an id the caller supplied, so a token is the only
    thing that identifies an invitation -- there is no id to enumerate.

    `now` is what `has_expired` takes and for the same reason: without it a test that mints an
    invitation at a fixed date passes until that date is a week ago, and then fails for a reason
    that has nothing to do with the code.
    """
    wanted = hash_token(token)
    for raw in (invitations or {}).values():
        invitation = raw if isinstance(raw, TeamInvitation) else TeamInvitation(**raw)
        if secrets.compare_digest(invitation.token_hash, wanted) and not has_expired(
            invitation, now=now
        ):
            return invitation
    return None


def find_invitation_for_email(invitations: dict, email: str) -> TeamInvitation | None:
    """An outstanding invitation for this address, expired or not -- what re-inviting refreshes."""
    wanted = normalise_email(email)
    for raw in (invitations or {}).values():
        invitation = raw if isinstance(raw, TeamInvitation) else TeamInvitation(**raw)
        if invitation.email == wanted:
            return invitation
    return None


def link_token(team_id: uuid.UUID | str, token: str) -> str:
    """What travels in the mail: the team, then the secret.

    Only the hash of the secret is stored, and it is stored inside one team's config -- so no
    query can find a token. The link has to name the team itself, which is why the id rides in
    front. It is not a secret: whoever opens the link is about to be shown that team's name
    anyway, and an id on its own grants nothing without the half that follows it.
    """
    return f"{team_id}.{token}"


def read_link_token(value: str) -> tuple[uuid.UUID, str] | None:
    """The team and the secret a link carries, or None when it is not one of ours.

    Split on the first dot only: `secrets.token_urlsafe` never produces one, so everything after
    it is the secret, whole.
    """
    team_id, separator, token = value.partition(".")
    if not separator or not token:
        return None
    try:
        return uuid.UUID(team_id), token
    except ValueError:
        return None
