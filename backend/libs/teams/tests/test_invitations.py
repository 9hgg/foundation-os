"""What an invitation promises, and what it refuses."""

import datetime
import uuid

from libs.teams.invitations import (
    INVITATION_LIFETIME,
    find_invitation,
    find_invitation_for_email,
    has_expired,
    hash_token,
    link_token,
    mint_invitation,
    read_link_token,
    refresh_invitation,
)

NOW = datetime.datetime(2026, 8, 29, 12, 0, tzinfo=datetime.UTC)


def test_the_token_is_returned_once_and_never_stored():
    """A team's config is readable by every member, so a raw token there would let any of them
    claim an invitation addressed to somebody else."""
    invitation, token = mint_invitation(email="new@example.test", role="member", now=NOW)

    assert token
    assert token not in invitation.model_dump_json()
    assert invitation.token_hash == hash_token(token)


def test_the_address_is_normalised_so_case_cannot_split_an_invitation():
    invitation, _ = mint_invitation(email="  New@Example.Test ", role="member", now=NOW)

    assert invitation.email == "new@example.test"


def test_it_lasts_a_week():
    invitation, _ = mint_invitation(email="new@example.test", role="member", now=NOW)

    assert not has_expired(invitation, now=NOW + datetime.timedelta(days=6, hours=23))
    assert has_expired(invitation, now=NOW + INVITATION_LIFETIME + datetime.timedelta(minutes=1))


def test_a_token_opens_its_invitation():
    invitation, token = mint_invitation(email="new@example.test", role="member", now=NOW)
    invitations = {invitation.id: invitation}

    assert find_invitation(invitations, token, now=NOW) is not None
    assert find_invitation(invitations, "not-the-token", now=NOW) is None


def test_an_expired_invitation_opens_nothing():
    invitation, token = mint_invitation(email="new@example.test", role="member", now=NOW)
    old = invitation.model_copy(update={"expires_at": (NOW - datetime.timedelta(days=1)).isoformat()})

    assert find_invitation({old.id: old}, token, now=NOW) is None


def test_re_inviting_rotates_the_token_and_keeps_the_invitation():
    """One address, one invitation. The previous mail stops working the moment a new one is sent."""
    invitation, first = mint_invitation(email="new@example.test", role="member", now=NOW)
    refreshed, second = refresh_invitation(invitation, now=NOW + datetime.timedelta(days=2))

    assert refreshed.id == invitation.id
    assert second != first
    # Passed the moment of the refresh, so what these test is the rotation and not the clock.
    at_refresh = NOW + datetime.timedelta(days=2)
    assert find_invitation({refreshed.id: refreshed}, first, now=at_refresh) is None
    assert find_invitation({refreshed.id: refreshed}, second, now=at_refresh) is not None
    assert not has_expired(refreshed, now=NOW + datetime.timedelta(days=8))


def test_re_inviting_can_change_the_role():
    """The role is on the invitation rather than in the token precisely so it can be changed."""
    invitation, _ = mint_invitation(email="new@example.test", role="member", now=NOW)

    refreshed, _ = refresh_invitation(invitation, role="admin", now=NOW)

    assert refreshed.role == "admin"


def test_finding_by_email_ignores_case_and_expiry():
    # Re-inviting somebody whose invitation lapsed should refresh that one, not add a second.
    invitation, _ = mint_invitation(email="new@example.test", role="member", now=NOW)
    lapsed = invitation.model_copy(update={"expires_at": (NOW - datetime.timedelta(days=1)).isoformat()})

    assert find_invitation_for_email({lapsed.id: lapsed}, "NEW@example.test") is not None
    assert find_invitation_for_email({lapsed.id: lapsed}, "someone@else.test") is None


def test_a_stored_invitation_survives_being_a_plain_dict():
    # Config comes back from the database as JSON, so the lookups have to read both shapes.
    invitation, token = mint_invitation(email="new@example.test", role="member", now=NOW)

    as_json = {invitation.id: invitation.model_dump()}

    assert find_invitation(as_json, token, now=NOW) is not None
    assert find_invitation_for_email(as_json, "new@example.test") is not None


def test_a_link_names_its_team_so_a_claim_knows_where_to_look():
    team_id = uuid.UUID("11111111-2222-3333-4444-555555555555")
    _, token = mint_invitation(email="new@example.test", role="member", now=NOW)

    assert read_link_token(link_token(team_id, token)) == (team_id, token)


def test_a_link_that_is_not_ours_is_refused_rather_than_guessed_at():
    assert read_link_token("no-dot-at-all") is None
    assert read_link_token("not-a-uuid.whatever") is None
    assert read_link_token(f"{uuid.uuid4()}.") is None
