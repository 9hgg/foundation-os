import datetime
from pathlib import Path

import structlog
from jinja2 import ChoiceLoader, FileSystemLoader
from jinja2.sandbox import ImmutableSandboxedEnvironment

from .config import MAILS_SETTINGS

logger = structlog.get_logger(__name__)

# backend root: template_utils.py lives at backend/libs/mails/
_BACKEND_ROOT = Path(__file__).resolve().parents[2]

# Jinja globals an app wants available in its own templates -- a generic opt-in seam so an
# app can add a helper (gadzapp registers a campus-palette resolver) without this shared
# module knowing anything app-specific. Empty by default; apps populate it at startup.
TEMPLATE_GLOBALS: dict = {}

# Names every render supplies itself, and which a template therefore never has to be given.
RENDERER_PROVIDED = {"current_year": lambda: datetime.datetime.now().year}


# One environment, kept, so Jinja's own template cache survives between renders. A campaign renders
# once per recipient: rebuilding the environment each time would re-read every template from
# scratch -- for a file-backed one, a storage download per contact. The loaders' `uptodate`
# callables are what make holding on to it safe; an edited template still takes effect on the next
# render. Keyed on the directory so a test pointing EMAIL_TEMPLATES_DIR elsewhere gets its own.
_ENVIRONMENT = None
_ENVIRONMENT_DIR: Path | None = None


def get_template_environment():
    """Get Jinja2 environment configured for email templates."""
    global _ENVIRONMENT, _ENVIRONMENT_DIR

    template_dir = Path(MAILS_SETTINGS.EMAIL_TEMPLATES_DIR)
    # Anchor a relative dir to the backend root so it resolves regardless of CWD
    # (cron scripts don't run from backend/, unlike the uvicorn app).
    if not template_dir.is_absolute():
        template_dir = _BACKEND_ROOT / template_dir
    # Imported here rather than at module scope: mail templates are a resource of their own and
    # this module is the generic renderer, so the dependency only exists at the moment one is
    # actually loaded.
    from libs.mail_templates.loader import MailTemplateLoader

    # Templates written in the app are tried first, the shipped files answer everything else. They
    # cannot collide: the former are addressed `db:<id>`, the latter by file name.
    # Sandboxed because template source is now authored by people, not only committed by us -- and
    # every transactional mail in the app renders through this one function.
    if _ENVIRONMENT is None or template_dir != _ENVIRONMENT_DIR:
        _ENVIRONMENT = ImmutableSandboxedEnvironment(
            loader=ChoiceLoader([MailTemplateLoader(), FileSystemLoader(str(template_dir))]),
            autoescape=True,  # For security when rendering HTML
        )
        _ENVIRONMENT_DIR = template_dir
    # Re-applied every call: an app registers its helpers at startup, which may land after the
    # first render in a worker.
    _ENVIRONMENT.globals.update(TEMPLATE_GLOBALS)
    return _ENVIRONMENT


def render_email_template(template_name: str, **context) -> str:
    """
    Render an email template with the given context.

    Args:
        template_name: Name of the template file (e.g., "email_templates/transactional_email.html")
        **context: Variables to pass to the template

    Returns:
        Rendered HTML string
    """
    try:
        env = get_template_environment()
        template = env.get_template(template_name)

        # Add some default context variables
        default_context = {name: factory() for name, factory in RENDERER_PROVIDED.items()}

        # Merge with provided context
        final_context = {**default_context, **context}

        return template.render(**final_context)
    except Exception as e:
        logger.exception("email_template_render_failed", template=template_name, error_type=type(e).__name__)
        raise


def render_email_source(source: str, **context) -> str:
    """Render Jinja source held in a resource, in the same sandboxed environment as the files."""
    provided = {name: factory() for name, factory in RENDERER_PROVIDED.items()}
    return get_template_environment().from_string(source).render(**{**provided, **context})


def render_transactional_email(
    title: str | None = None,
    subtitle: str | None = None,
    main_paragraph: str | None = None,
    button_text: str | None = None,
    button_url: str | None = None,
    additional_content: str | None = None,
    footer_message: str | None = None,
    origin: str | None = None,
) -> str:
    """
    Render the transactional email template with common parameters.

    Args:
        title: Email title (appears in header)
        subtitle: Main heading in content area
        main_paragraph: Main message content
        button_text: Text for the call-to-action button
        button_url: URL for the call-to-action button
        additional_content: Additional HTML content (use with caution)
        footer_message: Custom footer message (defaults to transactional message)
        origin: The site the email is being sent for (scheme+host of the triggering
            request). Passed through to the template as neutral context; each app's
            transactional.html uses it however it wants (gadzapp picks its campus
            colours from it) or ignores it. Not an app-specific concept, so it stays a
            plain optional field rather than a per-app hook.

    Returns:
        Rendered HTML string
    """
    return render_email_template(
        "transactional.html",
        title=title,
        subtitle=subtitle,
        main_paragraph=main_paragraph,
        button_text=button_text,
        button_url=button_url,
        additional_content=additional_content,
        footer_message=footer_message,
        origin=origin,
    )
