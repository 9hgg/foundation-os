"""
Tool tests for the Ralph harness.

Pattern: tools are called the same way the real step executor does it —
  1. Large data lives in the artifact store, referenced only by key.
  2. Tool args use {"artifact_ref": "<key>"} instead of inline data.
  3. resolve_refs() substitutes the real value at call time (data never
     flows through the model layer).
  4. Results are saved as new artifacts and chained by key.
"""

from __future__ import annotations

import random
from typing import Any

import pytest

from libs.ralph.context.auto_context import AutoContextBuilder
from libs.ralph.errors import EvidenceTooLargeError
from libs.ralph.state.artifacts import Artifact
from libs.ralph.state.run_context import AssistantRunContext
from libs.ralph.tools.local_tools import build_harness_tools
from libs.ralph.tools.registry import ToolRegistry

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_employees(count: int = 200) -> list[dict[str, Any]]:
    rng = random.Random(0)
    departments = ["Engineering", "Sales", "Marketing", "HR"]
    cities = ["Paris", "London", "Berlin"]
    return [
        {
            "id": i + 1,
            "name": f"Employee_{i + 1}",
            "department": rng.choice(departments),
            "city": rng.choice(cities),
            "salary": rng.randint(30_000, 120_000),
            "active": rng.random() > 0.15,
        }
        for i in range(count)
    ]


@pytest.fixture()
def employees() -> list[dict[str, Any]]:
    return _make_employees()


@pytest.fixture()
def ctx(employees: list[dict[str, Any]]) -> AssistantRunContext:
    run_ctx = AssistantRunContext(
        messages=[{"role": "user", "content": "test"}],
        auto_context=AutoContextBuilder().build([]),
    )
    run_ctx.auto_context.artifacts.put(
        Artifact(key="employees", value=employees, provenance="preseeded")
    )
    run_ctx.current_step_id = "step_1"
    return run_ctx


@pytest.fixture()
def tools(ctx: AssistantRunContext) -> ToolRegistry:
    return build_harness_tools(ctx)


# ---------------------------------------------------------------------------
# artifact_ref resolution helper (mirrors step_executor._resolve_runtime_refs)
# ---------------------------------------------------------------------------

def resolve(ctx: AssistantRunContext, value: Any) -> Any:
    """Recursively substitute {artifact_ref: key} with the actual stored value."""
    if isinstance(value, dict):
        if set(value.keys()) == {"artifact_ref"} and isinstance(value["artifact_ref"], str):
            return ctx.artifacts.get(value["artifact_ref"])
        return {k: resolve(ctx, v) for k, v in value.items()}
    if isinstance(value, list):
        return [resolve(ctx, v) for v in value]
    return value


def call(
    ctx: AssistantRunContext,
    tools: ToolRegistry,
    tool_name: str,
    tool_args: dict[str, Any],
    *,
    save_as: str | None = None,
) -> Any:
    """Resolve refs, call the tool, optionally save result, return value."""
    resolved = resolve(ctx, tool_args)
    result = tools.get(tool_name).fn(**resolved)
    if save_as is not None:
        ctx.artifacts.save(save_as, result, provenance="tool_call",
                           metadata={"tool_name": tool_name})
    return result


# ---------------------------------------------------------------------------
# artifact_ref resolution
# ---------------------------------------------------------------------------

class TestArtifactRefResolution:
    def test_plain_ref_resolves_to_value(self, ctx, employees):
        resolved = resolve(ctx, {"artifact_ref": "employees"})
        assert resolved is employees

    def test_nested_ref_in_dict(self, ctx, employees):
        resolved = resolve(ctx, {"items": {"artifact_ref": "employees"}, "logic": "and"})
        assert resolved["items"] is employees
        assert resolved["logic"] == "and"

    def test_ref_in_list(self, ctx, employees):
        resolved = resolve(ctx, [{"artifact_ref": "employees"}])
        assert resolved[0] is employees

    def test_scalar_passthrough(self, ctx):
        assert resolve(ctx, "hello") == "hello"
        assert resolve(ctx, 42) == 42
        assert resolve(ctx, None) is None

    def test_unknown_key_raises(self, ctx):
        with pytest.raises(KeyError):
            resolve(ctx, {"artifact_ref": "nonexistent"})

    def test_non_ref_dict_not_substituted(self, ctx):
        d = {"artifact_ref": "employees", "extra": "field"}
        resolved = resolve(ctx, d)
        # two keys — NOT treated as an artifact_ref
        assert resolved["artifact_ref"] == "employees"
        assert resolved["extra"] == "field"


# ---------------------------------------------------------------------------
# filter_items
# ---------------------------------------------------------------------------

class TestFilterItems:
    def test_filter_by_department_via_ref(self, ctx, tools, employees):
        result = call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [{"path": "department", "op": "eq", "value": "Engineering"}],
        })
        expected = [e for e in employees if e["department"] == "Engineering"]
        assert result == expected

    def test_filter_active_via_ref(self, ctx, tools, employees):
        result = call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [{"path": "active", "op": "eq", "value": True}],
        })
        assert all(e["active"] for e in result)
        assert len(result) == sum(1 for e in employees if e["active"])

    def test_multi_condition_and(self, ctx, tools, employees):
        result = call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [
                {"path": "department", "op": "eq", "value": "Engineering"},
                {"path": "active", "op": "eq", "value": True},
            ],
            "logic": "and",
        })
        expected = [e for e in employees if e["department"] == "Engineering" and e["active"]]
        assert result == expected

    def test_multi_condition_or(self, ctx, tools, employees):
        result = call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [
                {"path": "department", "op": "eq", "value": "Engineering"},
                {"path": "department", "op": "eq", "value": "Sales"},
            ],
            "logic": "or",
        })
        assert all(e["department"] in {"Engineering", "Sales"} for e in result)

    def test_filter_result_chainable_as_new_artifact(self, ctx, tools, employees):
        call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [{"path": "department", "op": "eq", "value": "HR"}],
        }, save_as="hr_employees")

        assert ctx.artifacts.get("hr_employees") is not None
        hr = ctx.artifacts.get("hr_employees")
        assert all(e["department"] == "HR" for e in hr)

    def test_filter_salary_gte(self, ctx, tools, employees):
        result = call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [{"path": "salary", "op": "gte", "value": 100_000}],
        })
        assert all(e["salary"] >= 100_000 for e in result)

    def test_conditions_as_dicts_are_coerced(self, ctx, tools):
        # conditions arrive as plain dicts from the LLM — must not crash
        result = call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [{"path": "city", "op": "eq", "value": "Paris"}],
        })
        assert all(e["city"] == "Paris" for e in result)


# ---------------------------------------------------------------------------
# count_items
# ---------------------------------------------------------------------------

class TestCountItems:
    def test_count_full_list_via_ref(self, ctx, tools, employees):
        result = call(ctx, tools, "count_items", {
            "items": {"artifact_ref": "employees"},
        })
        assert result == len(employees)

    def test_count_filtered_via_chain(self, ctx, tools, employees):
        call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [{"path": "department", "op": "eq", "value": "Sales"}],
        }, save_as="sales")

        result = call(ctx, tools, "count_items", {
            "items": {"artifact_ref": "sales"},
        })
        expected = sum(1 for e in employees if e["department"] == "Sales")
        assert result == expected


# ---------------------------------------------------------------------------
# sort_items
# ---------------------------------------------------------------------------

class TestSortItems:
    def test_sort_ascending(self, ctx, tools, employees):
        result = call(ctx, tools, "sort_items", {
            "items": {"artifact_ref": "employees"},
            "path": "salary",
        })
        salaries = [e["salary"] for e in result]
        assert salaries == sorted(salaries)

    def test_sort_descending(self, ctx, tools, employees):
        result = call(ctx, tools, "sort_items", {
            "items": {"artifact_ref": "employees"},
            "path": "salary",
            "reverse": True,
        })
        salaries = [e["salary"] for e in result]
        assert salaries == sorted(salaries, reverse=True)

    def test_sort_by_string_field(self, ctx, tools, employees):
        result = call(ctx, tools, "sort_items", {
            "items": {"artifact_ref": "employees"},
            "path": "department",
        })
        depts = [e["department"] for e in result]
        assert depts == sorted(depts)

    def test_sort_result_chainable(self, ctx, tools):
        call(ctx, tools, "sort_items", {
            "items": {"artifact_ref": "employees"},
            "path": "salary",
            "reverse": True,
        }, save_as="sorted_by_salary_desc")

        sorted_list = ctx.artifacts.get("sorted_by_salary_desc")
        assert sorted_list[0]["salary"] >= sorted_list[-1]["salary"]


# ---------------------------------------------------------------------------
# slice_items
# ---------------------------------------------------------------------------

class TestSliceItems:
    def test_slice_top_n(self, ctx, tools, employees):
        result = call(ctx, tools, "slice_items", {
            "items": {"artifact_ref": "employees"},
            "start": 0,
            "end": 10,
        })
        assert result == employees[:10]
        assert len(result) == 10

    def test_slice_from_middle(self, ctx, tools, employees):
        result = call(ctx, tools, "slice_items", {
            "items": {"artifact_ref": "employees"},
            "start": 5,
            "end": 15,
        })
        assert result == employees[5:15]

    def test_top5_after_sort_chain(self, ctx, tools):
        call(ctx, tools, "sort_items", {
            "items": {"artifact_ref": "employees"},
            "path": "salary",
            "reverse": True,
        }, save_as="sorted_desc")

        top5 = call(ctx, tools, "slice_items", {
            "items": {"artifact_ref": "sorted_desc"},
            "start": 0,
            "end": 5,
        })
        assert len(top5) == 5
        assert top5[0]["salary"] >= top5[4]["salary"]


# ---------------------------------------------------------------------------
# distinct_values
# ---------------------------------------------------------------------------

class TestDistinctValues:
    def test_distinct_departments(self, ctx, tools):
        result = call(ctx, tools, "distinct_values", {
            "items": {"artifact_ref": "employees"},
            "path": "department",
        })
        assert set(result) == {"Engineering", "Sales", "Marketing", "HR"}

    def test_distinct_cities(self, ctx, tools):
        result = call(ctx, tools, "distinct_values", {
            "items": {"artifact_ref": "employees"},
            "path": "city",
        })
        assert set(result) == {"Paris", "London", "Berlin"}

    def test_distinct_preserves_uniqueness(self, ctx, tools):
        result = call(ctx, tools, "distinct_values", {
            "items": {"artifact_ref": "employees"},
            "path": "department",
        })
        assert len(result) == len(set(result))


# ---------------------------------------------------------------------------
# get_first
# ---------------------------------------------------------------------------

class TestGetFirst:
    def test_returns_first_element(self, ctx, tools, employees):
        result = call(ctx, tools, "get_first", {
            "items": {"artifact_ref": "employees"},
        })
        assert result == employees[0]

    def test_returns_none_for_empty(self, ctx, tools):
        ctx.artifacts.save("empty", [], provenance="test")
        result = call(ctx, tools, "get_first", {
            "items": {"artifact_ref": "empty"},
        })
        assert result is None

    def test_first_of_sorted_chain(self, ctx, tools, employees):
        call(ctx, tools, "sort_items", {
            "items": {"artifact_ref": "employees"},
            "path": "salary",
            "reverse": True,
        }, save_as="sorted_desc")

        top = call(ctx, tools, "get_first", {
            "items": {"artifact_ref": "sorted_desc"},
        })
        max_salary = max(e["salary"] for e in employees)
        assert top["salary"] == max_salary


# ---------------------------------------------------------------------------
# Aggregation tools
# ---------------------------------------------------------------------------

class TestAggregationTools:
    def test_sum_items(self, ctx, tools, employees):
        result = call(ctx, tools, "sum_items", {
            "items": {"artifact_ref": "employees"},
            "path": "salary",
        })
        assert result == pytest.approx(sum(e["salary"] for e in employees))

    def test_average_items(self, ctx, tools, employees):
        result = call(ctx, tools, "average_items", {
            "items": {"artifact_ref": "employees"},
            "path": "salary",
        })
        expected = sum(e["salary"] for e in employees) / len(employees)
        assert result == pytest.approx(expected)

    def test_min_item(self, ctx, tools, employees):
        result = call(ctx, tools, "min_item", {
            "items": {"artifact_ref": "employees"},
            "path": "salary",
        })
        assert result == min(e["salary"] for e in employees)

    def test_max_item(self, ctx, tools, employees):
        result = call(ctx, tools, "max_item", {
            "items": {"artifact_ref": "employees"},
            "path": "salary",
        })
        assert result == max(e["salary"] for e in employees)

    def test_average_on_filtered_subset(self, ctx, tools, employees):
        call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [{"path": "department", "op": "eq", "value": "Engineering"}],
        }, save_as="engineers")

        result = call(ctx, tools, "average_items", {
            "items": {"artifact_ref": "engineers"},
            "path": "salary",
        })
        eng_salaries = [e["salary"] for e in employees if e["department"] == "Engineering"]
        assert result == pytest.approx(sum(eng_salaries) / len(eng_salaries))

    def test_average_raises_on_empty(self, ctx, tools):
        ctx.artifacts.save("empty", [], provenance="test")
        with pytest.raises(ValueError, match="No values"):
            call(ctx, tools, "average_items", {
                "items": {"artifact_ref": "empty"},
                "path": "salary",
            })

    def test_min_raises_on_empty(self, ctx, tools):
        ctx.artifacts.save("empty", [], provenance="test")
        with pytest.raises(ValueError, match="No values"):
            call(ctx, tools, "min_item", {
                "items": {"artifact_ref": "empty"},
                "path": "salary",
            })

    # --- compute ---

    def test_compute_subtraction(self, ctx, tools):
        result = call(ctx, tools, "compute", {"expression": "6 - 4"})
        assert result == 2.0

    def test_compute_addition(self, ctx, tools):
        assert call(ctx, tools, "compute", {"expression": "10 + 5"}) == 15.0

    def test_compute_multiplication(self, ctx, tools):
        assert call(ctx, tools, "compute", {"expression": "3 * 7"}) == 21.0

    def test_compute_division(self, ctx, tools):
        assert call(ctx, tools, "compute", {"expression": "10 / 4"}) == pytest.approx(2.5)

    def test_compute_parentheses(self, ctx, tools):
        assert call(ctx, tools, "compute", {"expression": "(6 - 4) * 3"}) == 6.0

    def test_compute_power(self, ctx, tools):
        assert call(ctx, tools, "compute", {"expression": "2 ** 8"}) == 256.0

    def test_compute_negative_unary(self, ctx, tools):
        assert call(ctx, tools, "compute", {"expression": "-4 + 10"}) == 6.0

    def test_compute_float_operands(self, ctx, tools):
        assert call(ctx, tools, "compute", {"expression": "1.5 * 4"}) == pytest.approx(6.0)

    def test_compute_blocks_function_calls(self, ctx, tools):
        with pytest.raises(ValueError, match="Unsupported"):
            call(ctx, tools, "compute", {"expression": "__import__('os')"})

    def test_compute_blocks_attribute_access(self, ctx, tools):
        with pytest.raises(ValueError):
            call(ctx, tools, "compute", {"expression": "(1).__class__"})

    def test_compute_invalid_syntax(self, ctx, tools):
        with pytest.raises(ValueError, match="Could not parse"):
            call(ctx, tools, "compute", {"expression": "6 -"})

    def test_compute_chainable_as_artifact(self, ctx, tools):
        # compute result can be saved and used as evidence
        call(ctx, tools, "compute", {"expression": "6 - 4"}, save_as="onions_to_buy")
        assert ctx.artifacts.get("onions_to_buy") == 2.0

    # --- round_value ---

    def test_round_to_integer(self, ctx, tools):
        assert call(ctx, tools, "round_value", {"value": 2.7}) == 3.0

    def test_round_to_decimals(self, ctx, tools):
        assert call(ctx, tools, "round_value", {"value": 3.14159, "decimals": 2}) == pytest.approx(3.14)

    def test_round_after_compute_chain(self, ctx, tools):
        call(ctx, tools, "compute", {"expression": "10 / 3"}, save_as="raw")
        result = call(ctx, tools, "round_value", {
            "value": {"artifact_ref": "raw"},
            "decimals": 1,
        })
        assert result == pytest.approx(3.3)


# ---------------------------------------------------------------------------
# get_artifact_structure
# ---------------------------------------------------------------------------

class TestGetArtifactStructure:
    def test_returns_paths_list(self, ctx, tools):
        result = call(ctx, tools, "get_artifact_structure", {
            "path": "employees",
        })
        assert isinstance(result, list)
        assert len(result) > 0

    def test_paths_include_nested_fields(self, ctx, tools):
        result = call(ctx, tools, "get_artifact_structure", {
            "path": "employees",
        })
        joined = "\n".join(result)
        assert "salary" in joined
        assert "department" in joined
        assert "city" in joined

    def test_scalar_artifact_structure(self, ctx, tools):
        ctx.artifacts.save("count", 42, provenance="test")
        result = call(ctx, tools, "get_artifact_structure", {
            "path": "count",
        })
        assert isinstance(result, list)

    def test_nested_artifact_structure_uses_full_path_root(self, ctx, tools):
        ctx.artifacts.save(
            "inventory",
            {"items": [{"name": "onions", "quantity": 4}]},
            provenance="test",
        )
        result = call(ctx, tools, "get_artifact_structure", {
            "path": "inventory.items",
        })
        assert "inventory.items[list_len=1].name" in result
        assert "inventory.items[list_len=1].quantity" in result


# ---------------------------------------------------------------------------
# read_artifact_property
# ---------------------------------------------------------------------------

class TestReadArtifactProperty:
    def test_read_top_level_list_item_field(self, ctx, tools, employees):
        result = call(ctx, tools, "read_artifact_property", {
            "path": "employees[0].salary",
        })
        assert result.value == employees[0]["salary"]

    def test_read_top_level_field(self, ctx, tools, employees):
        ctx.artifacts.save("single", employees[0], provenance="test")
        result = call(ctx, tools, "read_artifact_property", {
            "path": "single.department",
        })
        assert result.value == employees[0]["department"]

    def test_read_nested_field(self, ctx, tools):
        ctx.artifacts.save("record", {"meta": {"count": 99}}, provenance="test")
        result = call(ctx, tools, "read_artifact_property", {
            "path": "record.meta.count",
        })
        assert result.value == 99

    def test_unknown_artifact_error_includes_path_and_available_artifacts(self, ctx, tools):
        with pytest.raises(KeyError) as exc_info:
            call(ctx, tools, "read_artifact_property", {
                "path": "missing[0].impact",
            })

        message = str(exc_info.value)
        assert "missing[0].impact" in message
        assert "Available artifacts: employees" in message

    def test_empty_path_raises(self, ctx, tools):
        from libs.ralph.errors import EmptyArtifactPathError
        with pytest.raises(EmptyArtifactPathError):
            call(ctx, tools, "read_artifact_property", {"path": ""})


# ---------------------------------------------------------------------------
# create_evidence
# ---------------------------------------------------------------------------

class TestCreateEvidence:
    def test_property_evidence_from_scalar(self, ctx, tools):
        ctx.artifacts.save("count", 42, provenance="test")
        result = call(ctx, tools, "create_evidence", {
            "path": "count",
            "evidence_name": "The count",
            "evidence_description": "A test count.",
        })
        assert result.key is not None
        assert "42" in result.display

    def test_filter_evidence_from_list(self, ctx, tools, employees):
        # Pre-filter to a small subset so the evidence display fits within the size limit
        call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [
                {"path": "department", "op": "eq", "value": "HR"},
                {"path": "salary", "op": "gte", "value": 110_000},
            ],
            "logic": "and",
        }, save_as="hr_high_earners")

        result = call(ctx, tools, "create_evidence", {
            "path": "hr_high_earners",
            "evidence_name": "High-earning HR employees",
            "evidence_description": "HR employees with salary >= 110k.",
        })
        assert result.kind == "property"
        assert result.key is not None

    def test_evidence_too_large_raises(self, ctx, tools, employees):
        # A 200-item list will exceed the evidence size limit
        with pytest.raises(EvidenceTooLargeError):
            call(ctx, tools, "create_evidence", {"path": "employees"})

    def test_evidence_stored_in_ctx(self, ctx, tools):
        ctx.artifacts.save("val", 7, provenance="test")
        call(ctx, tools, "create_evidence", {
            "path": "val",
            "evidence_name": "Seven",
        })
        assert len(ctx.evidences.all()) == 1
        assert ctx.evidences.all()[0].value == 7

    def test_property_evidence_uses_full_artifact_path(self, ctx, tools, employees):
        ctx.artifacts.save("single", employees[0], provenance="test")
        result = call(ctx, tools, "create_evidence", {
            "path": "single.department",
            "evidence_name": "Department",
        })
        assert result.expression == "Evidence(single.department)"
        assert ctx.evidences.all()[0].value == employees[0]["department"]


# ---------------------------------------------------------------------------
# create_comparison_evidence
# ---------------------------------------------------------------------------

class TestCreateComparisonEvidence:
    def test_comparison_evidence_uses_full_artifact_paths(self, ctx, tools):
        ctx.artifacts.save("actual", {"quantity": 4}, provenance="test")
        ctx.artifacts.save("target", 6, provenance="test")

        result = call(ctx, tools, "create_comparison_evidence", {
            "left_path": "actual.quantity",
            "op": "lt",
            "right_path": "target",
            "evidence_name": "Need more",
        })

        assert result.kind == "comparison"
        assert result.expression == "Evidence(actual.quantity lt target)"
        assert ctx.evidences.all()[0].value["result"] is True


# ---------------------------------------------------------------------------
# save_artifact
# ---------------------------------------------------------------------------

class TestSaveArtifact:
    def test_saves_value_under_key(self, ctx, tools):
        call(ctx, tools, "save_artifact", {"key": "my_result", "value": [1, 2, 3]})
        assert ctx.artifacts.get("my_result") == [1, 2, 3]

    def test_saved_artifact_chainable(self, ctx, tools):
        call(ctx, tools, "save_artifact", {"key": "numbers", "value": [10, 20, 30]})
        result = call(ctx, tools, "count_items", {
            "items": {"artifact_ref": "numbers"},
        })
        assert result == 3


# ---------------------------------------------------------------------------
# Full chaining integration tests
# ---------------------------------------------------------------------------

class TestToolChaining:
    """End-to-end chains that mirror real LLM step sequences."""

    def test_filter_count_evidence_chain(self, ctx, tools, employees):
        """Filter active engineers → count → create evidence."""
        call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [
                {"path": "department", "op": "eq", "value": "Engineering"},
                {"path": "active", "op": "eq", "value": True},
            ],
            "logic": "and",
        }, save_as="active_engineers")

        call(ctx, tools, "count_items", {
            "items": {"artifact_ref": "active_engineers"},
        }, save_as="engineer_count")

        call(ctx, tools, "create_evidence", {
            "path": "engineer_count",
            "evidence_name": "Active engineer count",
            "evidence_description": "Number of active Engineering employees.",
        })

        assert len(ctx.evidences.all()) == 1
        expected = sum(1 for e in employees if e["department"] == "Engineering" and e["active"])
        assert ctx.evidences.all()[0].value == expected

    def test_filter_sort_slice_evidence_chain(self, ctx, tools, employees):
        """Filter → sort by salary desc → take top 3 → evidence the first."""
        call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [{"path": "department", "op": "eq", "value": "Sales"}],
        }, save_as="sales")

        call(ctx, tools, "sort_items", {
            "items": {"artifact_ref": "sales"},
            "path": "salary",
            "reverse": True,
        }, save_as="sales_sorted")

        call(ctx, tools, "slice_items", {
            "items": {"artifact_ref": "sales_sorted"},
            "start": 0,
            "end": 3,
        }, save_as="top3_sales")

        call(ctx, tools, "get_first", {
            "items": {"artifact_ref": "top3_sales"},
        }, save_as="top_earner")

        call(ctx, tools, "create_evidence", {
            "path": "top_earner",
            "evidence_name": "Top sales earner",
            "evidence_description": "The highest-paid Sales employee.",
        })

        top3 = ctx.artifacts.get("top3_sales")
        assert len(top3) == 3
        top = ctx.artifacts.get("top_earner")
        all_sales = [e for e in employees if e["department"] == "Sales"]
        assert top["salary"] == max(e["salary"] for e in all_sales)

    def test_aggregation_chain_filter_avg_evidence(self, ctx, tools, employees):
        """Filter active → average salary → evidence."""
        call(ctx, tools, "filter_items", {
            "items": {"artifact_ref": "employees"},
            "conditions": [{"path": "active", "op": "eq", "value": True}],
        }, save_as="active")

        call(ctx, tools, "average_items", {
            "items": {"artifact_ref": "active"},
            "path": "salary",
        }, save_as="avg_active_salary")

        call(ctx, tools, "create_evidence", {
            "path": "avg_active_salary",
            "evidence_name": "Average salary of active employees",
        })

        active = [e for e in employees if e["active"]]
        expected_avg = sum(e["salary"] for e in active) / len(active)
        assert ctx.evidences.all()[0].value == pytest.approx(expected_avg)

    def test_distinct_count_chain(self, ctx, tools):
        """Get distinct cities → count them."""
        call(ctx, tools, "distinct_values", {
            "items": {"artifact_ref": "employees"},
            "path": "city",
        }, save_as="cities")

        result = call(ctx, tools, "count_items", {
            "items": {"artifact_ref": "cities"},
        })
        assert result == 3  # Paris, London, Berlin
