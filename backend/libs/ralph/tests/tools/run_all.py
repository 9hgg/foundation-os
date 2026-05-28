"""Run script-based Ralph tool checks from raw JSON tool call payloads."""

from libs.ralph.tests.script_harness import SCENARIOS, run_json_scenario


def main() -> None:
    for index, scenario in enumerate(SCENARIOS, start=1):
        print(f"[{index:02d}/{len(SCENARIOS):02d}] {scenario.name}")
        print(f"  primary_tool: {scenario.primary_tool}")
        _, outputs, payloads = run_json_scenario(scenario)
        print(f"  json_calls: {len(payloads)}")
        print(f"  first_payload: {payloads[0]}")
        print(f"  final_output_type: {type(outputs[-1]).__name__}")
        print("  status: PASS\n")

    print(f"All {len(SCENARIOS)} JSON-driven Ralph tool demos passed.")


if __name__ == "__main__":
    main()
