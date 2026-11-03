# Mails library

This package centralizes everything related to transactional emails: models, templates, helper APIs, and the background tasks used to deliver messages.

## Architecture in a nutshell

1. **MailSettings** (`libs.mails.models.MailSettings`) stores a provider configuration (SMTP by default) in the database.
2. **Mail** rows describe pending/processed emails. Helpers such as `libs.mails.methods.add_mail_to_db` create them.
3. **Tasks** (`libs.mails.tasks.send_email` and `process_emails`) are registered on `TasksManager` and deliver the queued mails.
4. **Providers** live under `libs/mails/providers`. The default path uses `GenericSMTPProvider`, which decrypts credentials and talks directly to SMTP.

## Defining providers

Each app owns the responsibility of defining the MailSettings it needs. Keep that logic under `apps/<app>/mails/`:

- Use deterministic IDs (see `libs.utils.id.deterministic_uuid`) so you always know which row to select.
- Build the provider config with Pydantic settings if you want easy overriding from environment variables. `apps/spoken/mails/mailpit.py` and `apps/spoken/mails/ses.py` are good templates.

## Seeding MailSettings

Ship a `seed.py` module next to your provider declarations (see `apps/spoken/mails/seed.py`). It should upsert the MailSettings you defined so new environments can run:

```bash
uv run python -m apps.spoken.mails.seed
```

The values stored in the database are the source of truth for host, port, credentials, and TLS flags — no `MAIL_*` variable needs to be present at runtime for those settings.

## Selecting the active provider

`libs.mails.config.MAILS_SETTINGS` exposes a single field, `MAIL_SETTINGS_ID`, which is read from the environment (defaulting to all zeros). Each process must set this variable to the UUID of the MailSettings row it wants to use:

```bash
export MAIL_SETTINGS_ID="1e8619e7-b776-9886-6a45-c54627324e82"  # for Mailpit
```

Without a value, the task refuses to send emails and logs an explicit error.

## Sending flow

1. Feature code calls one of the helpers (e.g. `libs.mails.api.send_template_email`, `libs.notifications.methods`, or `libs.users.api`).
2. The helper invokes `add_mail_to_db`, which creates the `Mail` row and enqueues a `TasksManager` job (`send_email`).
3. `send_email` fetches the selected `MailSettings`, instantiates `GenericSMTPProvider`, and calls `send_email_with_attachments`.
4. Success or failure is written back to `Mail` and `MailAttempt` rows.

Because the mailer is task-driven, multiple emails can be queued and retried (with exponential backoff knobs in `libs.mails.tasks`).

## When to add environment variables

Only introduce env vars when you need to override the values consumed by your provider’s `BaseSettings` (for example, pointing Mailpit to a remote host). Otherwise keep configuration in the seeded `MailSettings` row and just change `MAIL_SETTINGS_ID` per environment.
## Email verifications

Proves that someone holds an address **for one occasion**, not in general.

The question this library answers is "did the holder of this address click the link we sent for
key XYZ", not "is this address verified". The same person proving the same address for a different
question counts as unproven there. That distinction is the whole point: a form asking for an email
in step 3 wants proof about *that* answer, not a badge earned elsewhere.

### The occasion, and its key

Callers never invent a key. They pass whatever identifies the occasion to
`build_verification_key(*parts)`, which hashes it:

```python
from libs.mails.methods import build_verification_key

key = build_verification_key(str(interaction.id), str(step.id))
```

Hashed so the key carries no readable ids, and derived in one place so every caller agrees on the
format. The key is not a secret — the token is.

### Verification flow

1. `POST /api/email-verifications/request` — `{email, interactionId, stepId, redirectUrl?}`.
   Mints a token, queues the mail, answers `{sent, verified, secondsBeforeResend}`.
2. `GET /api/email-verifications/verify/{token}` — the link inside the mail. Flips `verified`,
   then redirects to `redirect_url` when the caller asked for one, otherwise shows a plain page.
3. `POST /api/email-verifications/status` — `{email, interactionId, stepId}` →
   `{requested, verified, secondsBeforeResend}`. This is what a "I clicked the link" button polls.

Re-requesting **rotates the token on the same row**: the previous link stops working as soon as a
new one is sent, and a row already verified stays verified.

### Why these routes are open

Every route is reachable without an account, because the people proving an address are form
respondents, who never sign in. What guards them:

- The status route only answers yes/no about a pair the caller already knows. It discloses nothing.
- Sending is rate limited per `(email, key)` **server-side** (`RESEND_COOLDOWN`, 60s). A cooldown
  in the UI alone would leave an open relay pointed at any address in the world.
- Tokens expire (`TOKEN_LIFETIME`, 24h) and are `secrets.token_urlsafe(32)`.

### Sending the verification mail

The mail is created with `libs.mails.methods.add_mail_to_db` and executed with
`libs.tasks.methods.run_task_here`, so it goes out from the API process instead of waking a worker.
Someone is staring at "check your inbox" while it happens: a container start would dominate the
wait, and on a capped job the mail might never leave. It is still a tracked `Task`.

### Using it from a form step

`libs/forms/ui/src/lib/steps/email-request` is the reference consumer. It only shows the machinery
when the step's `verifiedEmailRequired` is on, mirrors `verified` into the step response so the
host sees it in the Responses table, and refuses to advance until the click is confirmed.
