import datetime
from typing import Optional

from jinja2 import Environment, FileSystemLoader

from libs.logger.customLogger import print_error

from .config import MAILS_SETTINGS


def get_template_environment():
    """Get Jinja2 environment configured for email templates."""

    template_dir = MAILS_SETTINGS.EMAIL_TEMPLATES_DIR
    return Environment(
        loader=FileSystemLoader(template_dir),
        autoescape=True,  # For security when rendering HTML
    )


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
        default_context = {
            "current_year": datetime.datetime.now().year,
        }

        # Merge with provided context
        final_context = {**default_context, **context}

        return template.render(**final_context)
    except Exception as e:
        print_error(f"Error rendering email template {template_name}: {e}")
        raise


def render_transactional_email(
    title: Optional[str] = None,
    subtitle: Optional[str] = None,
    main_paragraph: Optional[str] = None,
    button_text: Optional[str] = None,
    button_url: Optional[str] = None,
    additional_content: Optional[str] = None,
    footer_message: Optional[str] = None,
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
    )
