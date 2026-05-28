import json

import typer

from libs.simulation.methods import convert_modelica_script_to_fmu

app = typer.Typer(no_args_is_help=True)


@app.command()
def convert_modelica_to_fmu(
    modelica: str,
    model_name: str | None = None,
) -> None:
    conversion_result = convert_modelica_script_to_fmu(
        modelica_script_path=modelica, model_name=model_name
    )
    print(json.dumps(conversion_result.model_dump(), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    app()
