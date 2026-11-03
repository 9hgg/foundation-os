import datetime

import pytest

from libs.mails import methods


def test_key_is_stable_for_the_same_occasion():
    assert methods.build_verification_key("interaction-1", "step-1") == methods.build_verification_key("interaction-1", "step-1")


def test_key_differs_per_step_and_per_interaction():
    """The whole point: 'verified for this question' is not 'verified once, somewhere'."""
    same_interaction = methods.build_verification_key("interaction-1", "step-1")
    other_step = methods.build_verification_key("interaction-1", "step-2")
    other_interaction = methods.build_verification_key("interaction-2", "step-1")

    assert same_interaction != other_step
    assert same_interaction != other_interaction


def test_key_carries_no_readable_ids():
    key = methods.build_verification_key("interaction-1", "step-1")
    assert "interaction-1" not in key
    assert len(key) == 64  # sha256 hex


def test_key_refuses_to_name_nothing():
    with pytest.raises(ValueError):
        methods.build_verification_key("", "  ")


def test_emails_are_compared_case_insensitively():
    assert methods.normalize_email("  Joris@Rumble.Studio ") == "joris@rumble.studio"


def _verification(**overrides):
    """A stand-in row: these helpers only read timestamps off it."""
    now = datetime.datetime.now(datetime.UTC)
    fields = {"token_created_at": now, "verified": False}
    fields.update(overrides)
    return type("Row", (), fields)


def test_no_wait_when_nothing_was_ever_sent():
    assert methods.seconds_before_resend(None) == 0


def test_a_fresh_send_must_wait_the_full_cooldown():
    assert methods.seconds_before_resend(_verification()) == pytest.approx(60, abs=1)


def test_an_old_send_may_be_resent():
    long_ago = datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=5)
    assert methods.seconds_before_resend(_verification(token_created_at=long_ago)) == 0


def test_cooldown_copes_with_a_naive_timestamp():
    """Postgres can hand back a naive datetime depending on the driver; subtracting it from an
    aware 'now' would raise rather than merely be wrong."""
    naive = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
    assert methods.seconds_before_resend(_verification(token_created_at=naive)) == pytest.approx(60, abs=2)


def test_link_uses_the_configured_backend_url_not_the_request_host():
    """The bug: behind the proxy, request.base_url is an internal address, and the mail shipped a
    link nobody outside could open."""
    from unittest.mock import patch

    from libs.mails.methods import build_verification_link

    with patch("libs.users.config.USER_SETTINGS.BACKEND_URL", "https://spoken.systems"):
        link = build_verification_link("tok", "/api/email-verifications", "http://localhost:8000/")

    assert link == "https://spoken.systems/api/email-verifications/verify/tok"


def test_link_ignores_a_trailing_slash_on_the_configured_url():
    from unittest.mock import patch

    from libs.mails.methods import build_verification_link

    with patch("libs.users.config.USER_SETTINGS.BACKEND_URL", "https://spoken.systems/"):
        link = build_verification_link("tok", "/api/email-verifications", "http://x/")

    assert link == "https://spoken.systems/api/email-verifications/verify/tok"


def test_link_falls_back_to_the_request_when_no_backend_url_is_configured():
    """A local run with nothing configured still gets a link that works."""
    from unittest.mock import patch

    from libs.mails.methods import build_verification_link

    with patch("libs.users.config.USER_SETTINGS.BACKEND_URL", None):
        link = build_verification_link("tok", "/api/email-verifications", "http://localhost:8000/")

    assert link == "http://localhost:8000/api/email-verifications/verify/tok"
