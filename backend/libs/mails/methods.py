import contextlib
import hashlib
import secrets
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlmodel import Session

from libs.db import context_db
from libs.mails.models import Mail

from .config import MAILS_SETTINGS
from .models import (
    AdminMailAttemptSummary,
    AdminMailOverview,
    AdminMailSettingsSummary,
    AdminMailSummary,
    EmailVerification,
    MailAttempt,
    MailSettings,
)


def add_mail_to_db(
    sender_email: str,
    recipient_emails: list[str],
    subject: str,
    text_content: str,
    html_content: str | None = None,
    cc: list[str] | None = None,
    priority: int = 0,
    # pending, processing, sent, failed, replaced, unknown
    status: str = "pending",
):
    mail = Mail.create(
        obj_dict={
            "status": status,
            "subject": subject,
            "body": text_content,
            "body_html": html_content,
            "sender": sender_email,
            "priority": priority,
            "recipients": recipient_emails,
            "config": {"cc": cc or []},
        }
    )

    print("Mail added to the database", mail.subject, mail.recipients)

    return mail


def send_email_now(
    *,
    sender_email: str,
    recipient_emails: list[str],
    subject: str,
    text_content: str,
    html_content: str | None = None,
    provider=None,
) -> str:
    """Send one email on this thread, and record it, instead of queueing it for the worker.

    For the mails somebody is waiting to read -- a test send -- where going through the queue means
    waiting on whatever else is in it.
    """
    from libs.mails.providers.smtp._generic import GenericSMTPProvider

    address = (recipient_emails[0] if recipient_emails else "").strip()
    if not address:
        raise ValueError("An email needs an address to send to.")  # noqa: TRY003

    if provider is None:
        settings = MailSettings.by_id(MAILS_SETTINGS.MAIL_SETTINGS_ID)
        if settings is None:
            raise RuntimeError("No MailSettings configured (MAIL_SETTINGS_ID). Run the app seed first.")  # noqa: TRY003
        provider = GenericSMTPProvider(mail_settings=settings)

    mail = add_mail_to_db(
        priority=1,
        sender_email=sender_email,
        recipient_emails=recipient_emails,
        subject=subject,
        text_content=text_content,
        html_content=html_content or "",
        status="sending",
    )

    provider.smtp_connexion = None
    provider._connect()
    try:
        provider._send_email_with_attachments(
            sender_email=sender_email,
            recipient_emails=recipient_emails,
            subject=subject,
            text_content=text_content,
            html_content=html_content,
        )
    except Exception:
        Mail.patch(obj_id=mail.id, update_dict={"status": "failed"})
        raise
    else:
        Mail.patch(obj_id=mail.id, update_dict={"status": "sent"})
        return address
    finally:
        with contextlib.suppress(Exception):
            provider._disconnect()


def mail_task_description(mail: Mail) -> str:
    """Recipients and subject, for the send_email task's admin task list entry."""
    return f"To {', '.join(mail.recipients)} — {mail.subject}"


def get_admin_mail_overview(limit: int = 100) -> AdminMailOverview:
    with context_db() as db:
        recent_mails = (
            db.query(Mail)
            .order_by(Mail.time_created.desc())  # type: ignore[attr-defined]
            .limit(limit)
            .all()
        )
        recent_mail_ids = [mail.id for mail in recent_mails]

        mail_settings = (
            db.query(MailSettings)
            .order_by(MailSettings.name.asc())  # type: ignore[attr-defined]
            .all()
        )
        mail_settings_by_id = {
            mail_settings_row.id: mail_settings_row for mail_settings_row in mail_settings
        }

        attempts_by_mail_id: dict[UUID, list[AdminMailAttemptSummary]] = defaultdict(list)
        if recent_mail_ids:
            mail_attempts = (
                db.query(MailAttempt)
                .filter(MailAttempt.mail_id.in_(recent_mail_ids))
                .order_by(MailAttempt.time_created.desc())  # type: ignore[attr-defined]
                .all()
            )
            for mail_attempt in mail_attempts:
                mail_settings_row = mail_settings_by_id.get(mail_attempt.mail_settings_id)
                attempts_by_mail_id[mail_attempt.mail_id].append(
                    AdminMailAttemptSummary(
                        id=mail_attempt.id,
                        time_created=mail_attempt.time_created,
                        time_updated=mail_attempt.time_updated,
                        status=mail_attempt.status,
                        error=mail_attempt.error,
                        mail_id=mail_attempt.mail_id,
                        mail_settings_id=mail_attempt.mail_settings_id,
                        mail_settings_name=mail_settings_row.name if mail_settings_row else None,
                        mail_settings_kind=mail_settings_row.kind if mail_settings_row else None,
                    )
                )

    return AdminMailOverview(
        mail_settings=[
            AdminMailSettingsSummary(
                id=mail_settings_row.id,
                name=mail_settings_row.name,
                kind=mail_settings_row.kind,
                is_active=mail_settings_row.id == MAILS_SETTINGS.MAIL_SETTINGS_ID,
            )
            for mail_settings_row in mail_settings
        ],
        mails=[
            AdminMailSummary(
                id=mail.id,
                time_created=mail.time_created,
                time_updated=mail.time_updated,
                status=mail.status,
                subject=mail.subject,
                body=mail.body,
                body_html=mail.body_html,
                sender=mail.sender,
                priority=mail.priority,
                recipients=list(mail.recipients),
                attempts=attempts_by_mail_id[mail.id],
                attempts_count=len(attempts_by_mail_id[mail.id]),
            )
            for mail in recent_mails
        ],
    )


#: How long a minted link stays usable.
TOKEN_LIFETIME = timedelta(hours=24)

_EMPTY_KEY_MESSAGE = "A verification key needs at least one non-empty part"

#: Minimum delay between two sends for the same (email, key). Enforced here, not only in the UI:
#: this endpoint is reachable without an account and mails an arbitrary address, so the cooldown
#: is what stops it being used to flood someone's inbox.
RESEND_COOLDOWN = timedelta(seconds=60)


def build_verification_key(*parts: str) -> str:
    """Name the occasion a verification belongs to.

    Callers pass whatever identifies it — for a form step, the interaction id and the step id —
    and get back an opaque, stable key. Hashed so the key carries no readable ids, and derived
    here so every caller agrees on the format.
    """
    joined = "|".join(part.strip() for part in parts if part and part.strip())
    if not joined:
        raise ValueError(_EMPTY_KEY_MESSAGE)
    return hashlib.sha256(joined.encode("utf-8")).hexdigest()


def build_verification_link(token: str, prefix: str, request_base_url: str) -> str:
    """The address to put in a confirmation mail.

    Always BACKEND_URL, deliberately — including for a form served from a customer's own domain.
    The link claims a token against our API rather than showing customer content, and it has to
    keep working for the whole life of the token: a custom domain can lose its DNS or its
    certificate between the mail going out and the recipient clicking it, and a dead confirmation
    link is a lost response. It also keeps the API out of reach of a forged host header, since
    nothing about this URL is taken from the request.

    Where the respondent lands *after* confirming is a separate matter, and that one does follow
    the customer: the step's own verificationRedirectUrl.

    request_base_url is only a fallback for a local run with no BACKEND_URL configured.
    """
    from libs.users.config import USER_SETTINGS

    base = (USER_SETTINGS.BACKEND_URL or request_base_url).rstrip("/")
    return f"{base}{prefix}/verify/{token}"


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _now() -> datetime:
    return datetime.now(UTC)


def get_verification(email: str, key: str, _db: Session | None = None) -> EmailVerification | None:
    with context_db(_db) as db:
        return (
            db.query(EmailVerification)
            .filter(EmailVerification.email == normalize_email(email), EmailVerification.key == key)
            .first()
        )


def seconds_before_resend(verification: EmailVerification | None) -> int:
    """0 when a mail may be sent right now, otherwise how long the caller must wait."""
    if verification is None:
        return 0
    sent_at = verification.token_created_at
    if sent_at.tzinfo is None:
        sent_at = sent_at.replace(tzinfo=UTC)
    elapsed = _now() - sent_at
    remaining = RESEND_COOLDOWN - elapsed
    return max(0, int(remaining.total_seconds() + 0.999)) if remaining.total_seconds() > 0 else 0


def mint_verification(
    email: str,
    key: str,
    redirect_url: str | None = None,
    _db: Session | None = None,
) -> EmailVerification:
    """Create or refresh the verification for (email, key) and return it with a fresh token.

    Re-requesting rotates the token rather than adding a row, so an old link stops working as soon
    as a new one is sent, and a row already verified stays verified.
    """
    email = normalize_email(email)
    now = _now()

    with context_db(_db) as db:
        verification = (
            db.query(EmailVerification)
            .filter(EmailVerification.email == email, EmailVerification.key == key)
            .first()
        )

        if verification is None:
            # Resource.create, not db.add(Model(...)): it serializes the pydantic config into
            # JSON-safe values, which a direct insert does not.
            return EmailVerification.create(
                obj_dict={
                    "email": email,
                    "key": key,
                    "token": secrets.token_urlsafe(32),
                    "redirect_url": redirect_url,
                    "token_created_at": now,
                    "expires_at": now + TOKEN_LIFETIME,
                },
                _db=db,
            )
        else:
            verification.token = secrets.token_urlsafe(32)
            verification.token_created_at = now
            verification.expires_at = now + TOKEN_LIFETIME
            if redirect_url is not None:
                verification.redirect_url = redirect_url

        db.commit()
        db.refresh(verification)
        return verification


def claim_token(token: str, _db: Session | None = None) -> EmailVerification | None:
    """Mark the verification behind *token* as verified. None when the token is unknown or expired.

    Already-verified rows are returned as they are: clicking the same link twice is not an error,
    it is someone opening the mail again.
    """
    with context_db(_db) as db:
        verification = db.query(EmailVerification).filter(EmailVerification.token == token).first()
        if verification is None:
            return None

        expires_at = verification.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=UTC)
        if _now() > expires_at:
            return None

        if not verification.verified:
            verification.verified = True
            verification.verified_at = _now()
            db.commit()
            db.refresh(verification)

        return verification


def is_verified(email: str, key: str, _db: Session | None = None) -> bool:
    verification = get_verification(email, key, _db=_db)
    return bool(verification and verification.verified)
