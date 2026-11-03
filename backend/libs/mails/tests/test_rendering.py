"""The mapping between what a template asks for and what is known about one address."""

import datetime

from libs.mails.rendering import build_context, render_subject, render_variables


def _context(**contact):
    return build_context(
        contact={"email": "marie@example.test", "name": None, "config": {}, **contact},
        campaign={"name": "Rentrée"},
        app={"name": "spOken", "base_url": "https://spoken.systems"},
        unsubscribe_url="https://spoken.systems/unsub?token=abc",
        now=datetime.datetime(2026, 8, 17, 9, 30, tzinfo=datetime.UTC),
    )


def test_a_mapping_says_something_different_to_each_person():
    context = _context(name="Marie")

    rendered = render_variables({"title": "Bonjour {{ contact.name }}"}, context)

    assert rendered["title"] == "Bonjour Marie"


def test_a_mapping_can_stand_in_for_what_the_list_does_not_know():
    """Half an imported list having no first name is normal, and not a reason to send "Bonjour ."

    The second argument to `default` is what makes it cover a null as well as a missing key — a
    contact created from a pasted address has a name column, and that column is empty.
    """
    rendered = render_variables({"title": "Bonjour {{ contact.name | default('à tous', true) }}"}, _context())

    assert rendered["title"] == "Bonjour à tous"


def test_the_context_carries_the_app_the_campaign_and_the_clock():
    rendered = render_variables(
        {
            "footer": "{{ app.name }} — {{ campaign.name }} — {{ now.date }}",
            "cta": "{{ app.base_url }}/host/dashboard",
        },
        _context(),
    )

    assert rendered["footer"] == "spOken — Rentrée — 2026-08-17"
    assert rendered["cta"] == "https://spoken.systems/host/dashboard"


def test_a_value_that_is_not_a_template_is_itself():
    """Every mapping written before mappings existed keeps working."""
    rendered = render_variables({"discord_url": "https://discord.gg/x", "seats": 3}, _context())

    assert rendered["discord_url"] == "https://discord.gg/x"
    assert rendered["seats"] == 3


def test_a_broken_mapping_costs_its_own_variable_and_nothing_else():
    rendered = render_variables({"good": "{{ contact.email }}", "bad": "{{ contact.name.".strip()}, _context())

    assert rendered["good"] == "marie@example.test"
    assert rendered["bad"] == "{{ contact.name."


def test_the_subject_is_addressed_too():
    assert render_subject("Bonjour {{ contact.name }}, c'est prêt", _context(name="Marie")) == "Bonjour Marie, c'est prêt"


def test_a_mapping_cannot_reach_out_of_its_sandbox():
    """Mappings are typed into a text field. They render values, they do not run code."""
    rendered = render_variables({"nope": "{{ ''.__class__.__mro__ }}"}, _context())

    assert rendered["nope"] == "{{ ''.__class__.__mro__ }}"


def test_values_are_not_escaped_by_the_mapping():
    """The template escapes; escaping here as well is how an inbox gets "Marie &amp; Paul"."""
    rendered = render_variables({"title": "{{ contact.name }}"}, _context(name="Marie & Paul"))

    assert rendered["title"] == "Marie & Paul"


def test_a_mapping_reads_the_contact_and_its_own_data_separately():
    """`contact` is the contact itself; what the list knew about them stays under `config`."""
    context = _context(name="Marie", config={"plan": "lifetime", "first_name": "Marie-Claire"})

    rendered = render_variables(
        {"greeting": "Bonjour {{ contact.config.first_name }}", "plan": "{{ contact.config.plan }}"},
        context,
    )

    assert rendered["greeting"] == "Bonjour Marie-Claire"
    assert rendered["plan"] == "lifetime"


def test_a_mapping_cannot_reach_python_through_any_of_the_usual_doors():
    """These are the standard SSTI payloads. Each renders as its own text, having reached nothing."""
    payloads = {
        "mro": "{{ ''.__class__.__mro__ }}",
        "subclasses": "{{ ''.__class__.__base__.__subclasses__() }}",
        "globals": "{{ cycler.__init__.__globals__ }}",
        "builtins": "{{ ''.__class__.__mro__[1].__subclasses__() }}",
    }

    rendered = render_variables(payloads, _context())

    for name, payload in payloads.items():
        assert rendered[name] == payload


def test_a_mapping_cannot_mutate_what_it_is_given():
    """Immutable, so a mapping is a reading of the context and never an edit of it."""
    context = _context(config={"tags": ["backer"]})

    rendered = render_variables({"nope": "{{ contact.config.tags.append('admin') }}"}, context)

    assert rendered["nope"] == "{{ contact.config.tags.append('admin') }}"
    assert context["contact"]["config"]["tags"] == ["backer"]
