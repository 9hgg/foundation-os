import json

import typer

from libs.simulation.methods import run_simulation_from_local_path

app = typer.Typer(no_args_is_help=True)


@app.command()
def run_simulation(
    fmu: str,
    output: str,
    start_time: float = 0.0,
    stop_time: float = 10.0,
    output_interval: float | None = None,
) -> None:
    result = run_simulation_from_local_path(
        fmu_path=fmu,
        start_time=start_time,
        stop_time=stop_time,
        output_interval=output_interval,
    )
    with open(output, "w", encoding="utf-8") as output_file:
        json.dump(result.model_dump(), output_file, indent=2, ensure_ascii=False)
    print(f"Simulation result saved to {output}")


if __name__ == "__main__":
    app()
