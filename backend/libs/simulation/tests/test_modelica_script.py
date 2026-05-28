from libs.simulation.modelica_script import ModelicaScript


def test_parse_function_with_algorithm_if_expression():
    script = ModelicaScript.from_source(
        """
function scalarToFlag
  input Real x;
  output Real y;
algorithm
  y := noEvent(
    if x > 0 then 1 else 0);
end scalarToFlag;
"""
    )

    assert script.class_kind == "function"
    assert script.model_name == "scalarToFlag"
    assert script.algorithms == ["y := noEvent(\n    if x > 0 then 1 else 0)"]


def test_parse_connector_with_flow_variable():
    script = ModelicaScript.from_source(
        """
connector FluidPort
  flow Real m_flow;
  Real p;
end FluidPort;
"""
    )

    assert script.class_kind == "connector"
    assert [variable.kind for variable in script.variables] == ["flow", ""]


def test_parse_record_with_string_value_and_comment():
    script = ModelicaScript.from_source(
        """
record MediumData
  String mediumName = "TherminolVP1" "Name of the medium";
end MediumData;
"""
    )

    variable = script.variables[0]
    assert script.class_kind == "record"
    assert variable.value == '"TherminolVP1"'
    assert variable.comment == "Name of the medium"


def test_parse_package_with_nested_classes_and_type_aliases():
    script = ModelicaScript.from_source(
        """
package Common
  type Rate = Real(final unit="s-1");
  class ReleaseNotes
    annotation(Documentation(info="<html>notes</html>"));
  end ReleaseNotes;
  annotation(Icon(graphics={}));
end Common;
"""
    )

    assert script.class_kind == "package"
    assert script.model_name == "Common"
    assert script.variables == []

