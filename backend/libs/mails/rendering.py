"""What a campaign email says, and who it is saying it to.

A campaign message used to be one template plus one flat dict of variables, identical for every
address in the audience: the only thing that differed between two people receiving it was the
unsubscribe link. Writing the body by hand was therefore the only way to say anything specific.

Three pieces replace that:

- a **context**, the same shape for every send: the contact, the campaign, the app, the clock;
- a **mapping**, from the names a template expects to little Jinja strings over that context —
  ``{"title": "Bonjour {{ contact.name | default('à tous') }}"}``;
- **discovery**, so the app can offer the templates it has and say what each one expects, rather
  than asking someone to remember a file path.

The mapping is Jinja rather than an expression language of its own. There is then one syntax to
learn, one renderer to secure, and a mapping can do anything a template can — defaults, filters,
conditionals — without any of it being invented here.
"""

import datetime
import os
import textwrap
from dataclasses import dataclass
from pathlib import Path

import structlog
from jinja2 import TemplateNotFound, TemplateSyntaxError, meta, nodes
from jinja2.exceptions import SecurityError, UndefinedError
from jinja2.sandbox import ImmutableSandboxedEnvironment

from .config import MAILS_SETTINGS
from .template_utils import RENDERER_PROVIDED, TEMPLATE_GLOBALS, get_template_environment, render_email_template

logger = structlog.get_logger(__name__)

# Names the context always provides, so discovery can tell "the template asks for this" from
# "somebody has to map this".
CONTEXT_ROOTS = ("contact", "campaign", "app", "now", "unsubscribe_url")


@dataclass(frozen=True)
class TemplateChoice:
    """One template a campaign can pick, and what it expects to be given."""

    name: str
    title: str
    variables: tuple[str, ...]


def build_context(
    *,
    contact,
    campaign: dict | None = None,
    app: dict | None = None,
    unsubscribe_url: str | None = None,
    now: datetime.datetime | None = None,
) -> dict:
    """The facts available to a message's mapping, for one person.

    ``contact`` is the contact itself, dumped whole: ``contact.email``, ``contact.name``, and its own
    data under ``contact.config``. Nothing here is campaign-specific by design, so a mapping written
    for one campaign works in the next.
    """
    moment = now or datetime.datetime.now(datetime.UTC)

    return {
        "contact": contact if isinstance(contact, dict) else contact.model_dump(),
        "campaign": dict(campaign or {}),
        "app": dict(app or {}),
        "now": {
            "date": moment.date().isoformat(),
            "year": moment.year,
            "datetime": moment.isoformat(),
        },
        "unsubscribe_url": unsubscribe_url,
    }


def _sandbox() -> ImmutableSandboxedEnvironment:
    """Mappings, subjects and bodies are written by people, in a text field. They get a sandbox.

    Immutable, so a template can neither reach Python internals through dunders nor mutate anything
    it is handed. Autoescape stays off here: a mapping produces a *value*, and the template it is
    handed to is the thing that escapes it. Escaping twice is how "Marie &amp; Paul" reaches an inbox.
    """
    environment = ImmutableSandboxedEnvironment(autoescape=False)
    environment.globals.update(TEMPLATE_GLOBALS)
    return environment


def app_context() -> dict:
    """What `app` holds in every mail render: the product's own name and address, from the app."""
    return {
        "name": os.environ.get("APP_NAME"),
        "base_url": os.environ.get("APP_URL") or os.environ.get("FRONTEND_URL"),
    }


# Someone to render for before anyone real is involved. Deliberately obvious as a stand-in, and
# carrying the same keys a real one carries: a template must not preview against a shape that a
# campaign will never send.
SAMPLE_CONTACT = {"email": "sample@example.test", "name": "Sample Contact", "config": {}}
SAMPLE_CAMPAIGN = {"id": "00000000-0000-0000-0000-000000000000", "name": "Sample campaign", "description": "A campaign that exists only in previews."}

SAMPLE_LENGTH = 60


def context_fields(context: dict) -> list[dict]:
    """Every readable leaf of a render context, as dotted paths with the value each holds.

    Alphabetical by path, the whole list through, so it reads identically wherever it appears. A
    date is marked as one and sent whole, for the caller to format in the reader's own locale
    rather than ours.
    """
    fields: list[dict] = []

    def walk(path: str, value) -> None:
        if isinstance(value, dict):
            for key, nested in value.items():
                walk(f"{path}.{key}" if path else str(key), nested)
            return
        if isinstance(value, list):
            fields.append({"path": path, "sample": f"{len(value)} items"})
            return
        if isinstance(value, datetime.datetime | datetime.date):
            fields.append({"path": path, "sample": value.isoformat(), "kind": "date"})
            return
        sample = "" if value is None else str(value)
        fields.append({"path": path, "sample": textwrap.shorten(sample, SAMPLE_LENGTH, placeholder="…")})

    for root in CONTEXT_ROOTS:
        if root in context:
            walk(root, context[root])
    return sorted(fields, key=lambda field: field["path"])


def render_variables(mapping: dict[str, str], context: dict) -> dict:
    """Turn ``{"title": "Bonjour {{ target.name }}"}`` into ``{"title": "Bonjour Marie"}``.

    A value that is not a string is passed through untouched, so a mapping can still carry a
    number or a flag. A value that fails to render is left as it was written, and logged: an
    audience of ten thousand is no place to discover a typo, but neither is it a place to lose a
    whole send over one.
    """
    environment = _sandbox()
    rendered: dict = {}

    for name, expression in (mapping or {}).items():
        if not isinstance(expression, str):
            rendered[name] = expression
            continue
        try:
            rendered[name] = environment.from_string(expression).render(**context)
        except Exception as error:
            logger.warning(
                "mail_variable_render_failed",
                variable=name,
                error_type=type(error).__name__,
                error=str(error),
            )
            rendered[name] = expression

    return rendered


def render_subject(subject: str, context: dict) -> str:
    """The subject is a mapping of one: it is the line most worth addressing to someone."""
    return render_variables({"subject": subject}, context)["subject"]


def missing_variables(template_name: str, mapping: dict[str, str]) -> tuple[str, ...]:
    """Names the template reads that neither the mapping nor the context provides.

    What the campaign UI shows as "you still have to fill these in", and what a send can refuse on
    rather than emailing an audience a blank where a name should be.
    """
    expected = set(template_variables(template_name))
    provided = set((mapping or {}).keys()) | set(CONTEXT_ROOTS)
    return tuple(sorted(expected - provided))


def describe_template_error(error: Exception) -> str:
    """One sentence naming what is wrong, in the terms of whoever is editing the template."""
    if isinstance(error, TemplateSyntaxError):
        where = f" on line {error.lineno}" if error.lineno else ""
        return f"Syntax error{where}: {error.message}"
    if isinstance(error, SecurityError):
        return f"Not allowed in a template: {error}"
    if isinstance(error, UndefinedError):
        return f"Missing value: {error}"
    if isinstance(error, TemplateNotFound):
        return f"Template not found: {error}"
    # A value used the wrong way; the type is named because the message alone rarely locates it.
    return f"{type(error).__name__}: {error}"


def render_template_or_error(template_name: str, **context) -> tuple[str | None, str | None]:
    """Render, or say why not. Exactly one of the two is set."""
    try:
        return render_email_template(template_name, **context), None
    except Exception as error:
        return None, describe_template_error(error)


def missing_functions(template_name: str) -> tuple[str, ...]:
    """Names the template calls as functions that this app's environment does not define.

    Such a name is not a variable: supplying it as text makes the render fail on a call to a str.
    """
    environment = get_template_environment()
    try:
        source = environment.loader.get_source(environment, template_name)[0]
        parsed = environment.parse(source)
    except Exception as error:
        logger.warning("mail_template_unreadable", template=template_name, error=str(error))
        return ()

    called = {node.node.name for node in parsed.find_all(nodes.Call) if isinstance(node.node, nodes.Name)}
    return tuple(sorted(called - set(environment.globals) - set(RENDERER_PROVIDED)))


def source_defaults(template_name: str) -> dict[str, str]:
    """The literal each name falls back to in the source, from `{{ name | default('...') }}`.

    What a value reverts to once nothing overrides it, so the editor can say what clearing a field
    will show.
    """
    environment = get_template_environment()
    try:
        source = environment.loader.get_source(environment, template_name)[0]
    except Exception as error:
        logger.warning("mail_template_unreadable", template=template_name, error=str(error))
        return {}
    return defaults_in_source(source)


def defaults_in_source(source: str) -> dict[str, str]:
    """`source_defaults` for a source already in hand -- a campaign message's own body."""
    environment = get_template_environment()
    try:
        parsed = environment.parse(source)
    except Exception as error:
        logger.warning("mail_source_unparseable", error=str(error))
        return {}

    defaults: dict[str, str] = {}
    for node in parsed.find_all(nodes.Filter):
        if node.name != "default" or not isinstance(node.node, nodes.Name) or not node.args:
            continue
        first = node.args[0]
        if isinstance(first, nodes.Const):
            defaults[node.node.name] = str(first.value)
    return defaults


def template_variables(template_name: str) -> tuple[str, ...]:
    """Every name a template reads, taken from the template itself.

    Parsed rather than declared: a list of expected variables kept beside a template is a list that
    goes stale the first time someone edits the template and not the list.
    """
    environment = get_template_environment()
    try:
        source = environment.loader.get_source(environment, template_name)[0]
    except Exception as error:
        logger.warning("mail_template_unreadable", template=template_name, error=str(error))
        return ()

    # `find_undeclared_variables` does not see the environment, so its globals are subtracted here.
    parsed = environment.parse(source)
    called = {node.node.name for node in parsed.find_all(nodes.Call) if isinstance(node.node, nodes.Name)}
    provided = set(environment.globals) | set(RENDERER_PROVIDED) | called
    return tuple(sorted(meta.find_undeclared_variables(parsed) - provided))


def _db_template_choices() -> list[TemplateChoice]:
    """The templates written in the app, listed beside the ones shipped as files.

    Kept tolerant on purpose: a template whose source cannot be read (an uploaded file that went
    missing) drops out of the picker instead of taking the whole list down with it.
    """
    from libs.mail_templates.loader import address_for
    from libs.mail_templates.models import MailTemplate

    choices: list[TemplateChoice] = []
    for row in sorted(MailTemplate.get_list(), key=lambda template: (template.name or "")):
        name = address_for(row)
        try:
            variables = template_variables(name)
        except Exception as error:
            logger.warning("mail_template_unreadable", template=name, error=str(error))
            continue
        choices.append(TemplateChoice(name=name, title=row.name or "Untitled template", variables=variables))
    return choices


def available_templates() -> list[TemplateChoice]:
    """The templates a campaign can choose from, with what each one expects.

    Everything under the mail templates directory, so adding a template is adding a file. The
    title is the file name made readable — enough for a picker, and nothing to keep in sync.
    """
    root = Path(MAILS_SETTINGS.EMAIL_TEMPLATES_DIR)
    if not root.is_absolute():
        root = Path(__file__).resolve().parents[2] / root

    if not root.is_dir():
        logger.warning("mail_templates_dir_missing", path=str(root))
        return []

    choices: list[TemplateChoice] = _db_template_choices()
    for path in sorted(root.rglob("*.html")):
        name = str(path.relative_to(root))
        choices.append(
            TemplateChoice(
                name=name,
                title=path.stem.replace("_", " ").replace("-", " ").strip().capitalize(),
                variables=template_variables(name),
            )
        )

    return choices
