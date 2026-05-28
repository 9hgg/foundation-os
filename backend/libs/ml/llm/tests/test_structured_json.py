"""Unit tests for JSON normalization and repair helpers in structured.py."""

import json

import pytest

from libs.ml.llm.structured import (
    _find_balanced_json_block,
    _normalize_json_text,
    _repair_structural_json,
    _repair_unquoted_keys,
    _try_load,
)

# ---------------------------------------------------------------------------
# _try_load
# ---------------------------------------------------------------------------


class TestTryLoad:
    def test_valid_object(self):
        assert _try_load('{"a": 1}') == '{"a": 1}'

    def test_valid_array(self):
        assert _try_load("[1, 2, 3]") == "[1, 2, 3]"

    def test_invalid_returns_none(self):
        assert _try_load("{a: 1}") is None

    def test_empty_returns_none(self):
        assert _try_load("") is None

    def test_plain_text_returns_none(self):
        assert _try_load("hello world") is None


# ---------------------------------------------------------------------------
# _repair_unquoted_keys
# ---------------------------------------------------------------------------


class TestRepairUnquotedKeys:
    def test_simple_unquoted_keys(self):
        result = _repair_unquoted_keys("{use_tool:false,tool_name:null}")
        assert json.loads(result) == {"use_tool": False, "tool_name": None}

    def test_already_quoted_keys_unchanged(self):
        text = '{"use_tool": false, "tool_name": null}'
        assert _repair_unquoted_keys(text) == text

    def test_mixed_quoted_and_unquoted(self):
        result = _repair_unquoted_keys('{"use_tool":false,tool_name:null}')
        assert json.loads(result) == {"use_tool": False, "tool_name": None}

    def test_nested_objects(self):
        result = _repair_unquoted_keys("{outer:{inner:1}}")
        assert json.loads(result) == {"outer": {"inner": 1}}

    def test_string_values_with_colons_untouched(self):
        # colon inside a string value must not trigger key quoting
        result = _repair_unquoted_keys('{"key":"value:with:colons"}')
        assert json.loads(result) == {"key": "value:with:colons"}

    def test_string_value_containing_object_like_text(self):
        result = _repair_unquoted_keys('{"reasoning":"The model chose x:y because z"}')
        assert json.loads(result) == {"reasoning": "The model chose x:y because z"}

    def test_escaped_quote_in_string(self):
        result = _repair_unquoted_keys(r'{"key":"value with \"quotes\""}')
        parsed = json.loads(result)
        assert parsed["key"] == 'value with "quotes"'

    def test_array_values_not_treated_as_keys(self):
        result = _repair_unquoted_keys('{"items":[1,2,3]}')
        assert json.loads(result) == {"items": [1, 2, 3]}

    def test_key_with_spaces_before_colon(self):
        result = _repair_unquoted_keys("{key : 1}")
        assert json.loads(result) == {"key": 1}

    def test_exact_failing_llm_output(self):
        # reproduces the exact output from the gemma4:e2b failure
        raw = "{use_tool:false,tool_name:null,tool_args:null,artifact_key:null,reasoning:done}"
        result = _repair_unquoted_keys(raw)
        # tool_args/artifact_key are null, reasoning value is bare word — not valid JSON yet
        # but keys are now quoted, which is the responsibility of this function
        assert '"use_tool"' in result
        assert '"tool_name"' in result
        assert '"tool_args"' in result
        assert '"artifact_key"' in result
        assert '"reasoning"' in result

    def test_empty_object(self):
        assert _repair_unquoted_keys("{}") == "{}"

    def test_empty_string(self):
        assert _repair_unquoted_keys("") == ""


# ---------------------------------------------------------------------------
# _find_balanced_json_block
# ---------------------------------------------------------------------------


class TestFindBalancedJsonBlock:
    def test_plain_object(self):
        assert _find_balanced_json_block('{"a": 1}') == '{"a": 1}'

    def test_object_with_preamble(self):
        result = _find_balanced_json_block('Here is the JSON: {"a": 1}')
        assert result == '{"a": 1}'

    def test_object_with_trailing_text(self):
        result = _find_balanced_json_block('{"a": 1} some trailing text')
        assert result == '{"a": 1}'

    def test_array(self):
        assert _find_balanced_json_block("[1, 2, 3]") == "[1, 2, 3]"

    def test_nested(self):
        text = 'prefix {"outer": {"inner": 42}} suffix'
        result = _find_balanced_json_block(text)
        assert json.loads(result) == {"outer": {"inner": 42}}

    def test_no_json_returns_none(self):
        assert _find_balanced_json_block("no json here") is None

    def test_unbalanced_returns_none(self):
        assert _find_balanced_json_block('{"a": 1') is None

    def test_json_inside_string_not_extracted(self):
        # a valid outer object beats the inner string content
        text = '{"key": "{\\"inner\\": 1}"}'
        result = _find_balanced_json_block(text)
        assert json.loads(result) == {"key": '{"inner": 1}'}


# ---------------------------------------------------------------------------
# _repair_structural_json
# ---------------------------------------------------------------------------


class TestRepairStructuralJson:
    def test_trailing_comma_object(self):
        result = _repair_structural_json('{"a": 1,}')
        assert json.loads(result) == {"a": 1}

    def test_trailing_comma_array(self):
        result = _repair_structural_json("[1, 2, 3,]")
        assert json.loads(result) == [1, 2, 3]

    def test_unclosed_object(self):
        result = _repair_structural_json('{"a": 1')
        assert json.loads(result) == {"a": 1}

    def test_unclosed_nested(self):
        result = _repair_structural_json('{"a": {"b": 2}')
        assert json.loads(result) == {"a": {"b": 2}}

    def test_already_valid_unchanged(self):
        text = '{"a": 1}'
        assert json.loads(_repair_structural_json(text)) == {"a": 1}


# ---------------------------------------------------------------------------
# _normalize_json_text (integration)
# ---------------------------------------------------------------------------


class TestNormalizeJsonText:
    def test_valid_json_passthrough(self):
        text = '{"use_tool": false}'
        assert json.loads(_normalize_json_text(text)) == {"use_tool": False}

    def test_strips_code_fences(self):
        text = "```json\n{\"a\": 1}\n```"
        assert json.loads(_normalize_json_text(text)) == {"a": 1}

    def test_unquoted_keys_repaired(self):
        text = "{use_tool:false,tool_name:null}"
        result = _normalize_json_text(text)
        assert json.loads(result) == {"use_tool": False, "tool_name": None}

    def test_unquoted_keys_with_preamble(self):
        text = "Sure, here you go: {use_tool:false}"
        result = _normalize_json_text(text)
        assert json.loads(result) == {"use_tool": False}

    def test_structural_repair_after_key_repair(self):
        text = "{use_tool:false,}"
        result = _normalize_json_text(text)
        assert json.loads(result) == {"use_tool": False}

    def test_unclosed_object_with_unquoted_keys(self):
        text = "{use_tool:false"
        result = _normalize_json_text(text)
        assert json.loads(result) == {"use_tool": False}

    def test_object_buried_in_prose(self):
        text = 'I think the answer is {"score": 42} based on the data.'
        result = _normalize_json_text(text)
        assert json.loads(result) == {"score": 42}

    def test_empty_returns_empty(self):
        assert _normalize_json_text("") == ""
        assert _normalize_json_text("   ") == ""

    def test_gemma_failure_all_primitive_values(self):
        # same pattern as the production crash but with parseable values
        raw = "{use_tool:false,tool_name:null,tool_args:{},artifact_key:null}"
        result = _normalize_json_text(raw)
        parsed = json.loads(result)
        assert parsed["use_tool"] is False
        assert parsed["tool_name"] is None

    def test_unquoted_string_value_not_repairable(self):
        # bare string values (not JSON primitives) cannot be auto-repaired —
        # quoting them is too ambiguous; normalize falls back to the original
        raw = "{use_tool:false,reasoning:some free text here}"
        result = _normalize_json_text(raw)
        assert result == raw  # returned as-is; nothing could be parsed
        with pytest.raises(json.JSONDecodeError):
            json.loads(result)
