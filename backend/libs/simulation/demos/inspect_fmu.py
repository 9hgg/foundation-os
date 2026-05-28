import json

import typer

from libs.simulation.methods import inspect_fmu_from_local_path

app = typer.Typer(no_args_is_help=True)


@app.command()
def inspect_fmu(fmu: str) -> None:
    inspection = inspect_fmu_from_local_path(fmu_path=fmu)
    print(json.dumps(inspection.model_dump(), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    app()
