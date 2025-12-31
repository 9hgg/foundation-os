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
