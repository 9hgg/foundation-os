# Mail processors — design notes (WIP)

`providers/` is *transport* (smtp vs api). `processors/` is *vendor intelligence*: reading
what a sending service knows about our account — suppression lists, quotas, reputation.
SES first; mailgun/mailjet/brevo would be siblings. Same shape as `libs/files/processors/`:
a `_generic.py` base + a kind→class registry + one subpackage per vendor.

## Why (the problem this solves)

Campaign sends run through SES SMTP, which *accepts* mail for addresses on SES's
account-level suppression list and silently drops it — a hard bounce never comes back as an
SMTP error, so delivery rows say `sent` for addresses that will never receive anything, and
nothing in the DB knows an address bounced. High bounce/complaint rates can get the whole
SES account paused (taking transactional mail down with it). SES maintains the authoritative
per-address suppression list; we just never read it.

## Facts established (exploration, 2026-08-21)

- **The existing `AWS_SES_ACCESS_KEY(_SECRET)` env vars are SMTP-only credentials** — the
  secret is the derived SMTP password, proven unusable for the AWS API
  (`SignatureDoesNotMatch`). The processor needs a **new IAM access key** (spOken's SES
  account, us-east-1) allowing `ses:GetAccount`, `ses:ListSuppressedDestinations`,
  `ses:GetSuppressedDestination`. Manual console step; code ships testable without it.
- **boto3 is not actually installed for prod**: it resolves in `uv.lock` only through
  unselected extras, so `.venv-spoken` won't have it. Add `boto3` to
  `backend/pyproject.toml` core `dependencies` and re-lock.
- `Contact` (libs/contacts/models.py) is deliberately **not unique on email** — suppression
  is per-address, so a sync must update every contact row sharing the address.
- **Only spoken's alembic chain has `contacts`** (checked all 9 apps' versions dirs) → one
  migration, in `apps/spoken/alembic/postgres/versions/`.
- Skip precedent in campaigns: unsubscribed is excluded at enqueue (`enqueue_message`) *and*
  re-checked at send (`send_delivery` → `status: "skipped"`). `MailCampaignDelivery.error`
  is only written on failures today — a free slot for a skip *reason*, no migration needed.
- Router conventions: `create_*_router(prefix, *, flag_key)` factories;
  `libs/cronjobs/api.py`'s `_require_admin` is the model for account-level admin endpoints.
  `apps/spoken/app.py` never imports `apps.spoken.mails` today — a router makes that import
  necessary (like `from apps.spoken import workers  # noqa: F401`).
- Recurrence = **VM crontab only** (`ops/spoken/cronjobs/prod.cronjobs`) driving typer
  scripts in `apps/spoken/scripts/` with `--dry-run/--live` defaulting to dry
  (`send_notification_digests.py` is the model).
- Settings conventions: lib `config.py` holds generic shapes (plain `BaseModel`, like
  `SMTPConfig`); the app module holds the `BaseSettings` + the instance
  (`apps/spoken/mails/ses.py` is the template). **No instance in the lib.**

## Plan

### 1. Fill this skeleton

- `__init__.py` + `_generic.py`: `GenericMailProcessor` base +
  `MAIL_PROCESSOR_KIND_MAPPING = {"ses": SESProcessor}` — same idiom as
  `providers/__init__.py` and `libs/files/processors/`.
- `ses/config.py` — `SESProcessorConfig(BaseModel)`: `access_key_id`, `secret_access_key`,
  `region`. No instance here.
- `ses/methods.py` — `SESProcessor` with a lazily-built boto3 `sesv2` client (boto3 imported
  in this module only):
  - `account()` → `GetAccount`: production access, Max24HourSend / MaxSendRate /
    SentLast24Hours, suppression attributes — one typed pydantic result.
  - `suppressed_addresses(reasons=None)` → paginated `ListSuppressedDestinations` →
    `[SuppressedAddress(email, reason "BOUNCE"|"COMPLAINT", last_update_time)]`.
  - Fail fast — boto errors propagate, no `except: return {}`.
- `ses/errors.py` — one exception per failure mode, like `providers/smtp/errors.py`.
- `ses/api.py` — `create_ses_processor_router(get_processor, prefix="/api/mail-processors/ses")`,
  admin-gated (account-level data, not per-user):
  - `GET {prefix}/account` — quota / reputation / production flag
  - `GET {prefix}/suppressions` — current list
  - `POST {prefix}/suppressions/sync` — pull + apply to contacts, return counts
  `get_processor` is a callable so the app passes its configured instance without the lib
  importing app code.

### 2. Contacts: email-health columns + migration + sync method

- `Contact`: add `email_status: str = "ok"` (`ok | bounced | complained`) and
  `email_status_detail: str | None` (reason + SES timestamp).
- `libs/contacts/methods.py::apply_suppressions(entries)` — takes
  `[(email, reason, detail)]`, updates **all** contact rows matching each address
  (case-insensitive) whose status differs; never un-suppresses. Contacts-side on purpose:
  `libs/mails` stays free of a contacts dependency; the caller glues processor → contacts.
- Migration in spoken's chain: `op.add_column` ×2 — `email_status` with
  `server_default='ok'` (prod rows exist), nullable detail.
- Frontend: `Contact` interface gains `emailStatus?`/`emailStatusDetail?`; a small read-only
  badge in the contact builder. No new controls.

### 3. Campaign task takes it into account

- **Keep enqueue as-is** (deliberate deviation from the unsubscribed precedent): suppressed
  contacts still get a delivery row, and `send_delivery` skips them with
  `{"status": "skipped", "error": "suppressed (bounced)"}`. Rationale: unsubscribed means
  "left the audience"; suppressed means "in the audience, undeliverable" — a skipped row
  with a reason is the honest, visible record, and progress counts stay consistent with the
  audience summary.
- Also set `error: "unsubscribed"` on the existing unsubscribe skip so skipped rows are
  distinguishable (free — reuses the error column).
- The check sits in `send_delivery` right after the unsubscribed check; `contact` is already
  in hand via `Recipient`.

### 4. spOken wiring

- `apps/spoken/mails/processors/ses.py`: `SpokenSESProcessorSettings(BaseSettings)` with
  `AWS_SES_API_ACCESS_KEY: str | None`, `AWS_SES_API_ACCESS_KEY_SECRET: str | None`,
  `AWS_SES_REGION: str = "us-east-1"` (optional so every env boots before the key exists;
  client creation raises clearly if used unconfigured) + `SPOKEN_SES_PROCESSOR` instance.
- `apps/spoken/app.py`: import the module + `include_router(...)` in the mailing block.
- `apps/spoken/envs/{dev,prod}.env`: the three new vars (empty until the IAM key exists).
- `apps/spoken/scripts/sync_ses_suppressions.py`: typer CLI, `--dry-run/--live` (dry
  default), subcommands `sync` and `account`.
- `ops/spoken/cronjobs/prod.cronjobs`: one daily line calling `sync --live`.

### 5. Tests

- Processor: injected fake sesv2 client (pagination, reason filter, typed results,
  unconfigured-credentials error). No network.
- `apply_suppressions`: multi-row-per-address, idempotence, case-insensitive, unknown
  addresses ignored, never un-suppresses.
- Campaign (Postgres-backed, mirror `test_unsubscribe_after_enqueue_is_skipped`): suppressed
  contact → `skipped` with `error="suppressed (bounced)"`.
- Router: admin gating + happy path with a fake processor.

### Verification

- Unit suites + ruff; `alembic upgrade head` on local dev DB.
- End-to-end without AWS: set a dev contact's `email_status='bounced'` by hand, run a
  throwaway campaign against mailpit, confirm the skip, clean up.
- Live read-only once the IAM key exists: `sync_ses_suppressions.py account` +
  `sync --dry-run` against the real account.

## Out of scope (future)

- Real-time SNS/webhook event destinations (the SMTP header already names
  `default-smtp-configuration-set`) — pull-based sync is v1.
- Un-suppression / reactivation flows; per-customer sender-domain onboarding.
- Other processors (mailgun/brevo) — `_generic.py` + the registry is the extension point.
