import pytest
from unittest.mock import MagicMock, patch
from libs.mails.template_utils import render_email_template, render_transactional_email


@patch("libs.mails.template_utils.get_template_environment")
def test_render_email_template(mock_get_env):
    mock_env = MagicMock()
    mock_template = MagicMock()
    mock_get_env.return_value = mock_env
    mock_env.get_template.return_value = mock_template
    mock_template.render.return_value = "<html>Rendered</html>"

    result = render_email_template("test.html", var="value")

    assert result == "<html>Rendered</html>"
    mock_env.get_template.assert_called_with("test.html")
    mock_template.render.assert_called()
    call_kwargs = mock_template.render.call_args[1]
    assert call_kwargs["var"] == "value"
    assert "current_year" in call_kwargs


@patch("libs.mails.template_utils.render_email_template")
def test_render_transactional_email(mock_render):
    mock_render.return_value = "<html>Transactional</html>"

    result = render_transactional_email(
        title="Title", subtitle="Subtitle", main_paragraph="Body", button_text="Click", button_url="http://url"
    )

    assert result == "<html>Transactional</html>"
    mock_render.assert_called_with(
        "transactional.html",
        title="Title",
        subtitle="Subtitle",
        main_paragraph="Body",
        button_text="Click",
        button_url="http://url",
        additional_content=None,
        footer_message=None,
    )
