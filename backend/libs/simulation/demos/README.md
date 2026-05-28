# Simulation demos (FMU / Modelica / CRML)

This folder shows how to use `libs.simulation` without the frontend.

## 1) Inspect an FMU

```bash
cd backend
uv run python -m libs.simulation.demos.inspect_fmu /absolute/path/to/model.fmu
```

## 2) Run an FMU simulation and save JSON

```bash
cd backend
uv run python -m libs.simulation.demos.run_simulation /absolute/path/to/model.fmu ./simulation-result.json --stop-time 20
```

## 3) Convert a Modelica script to FMU (OpenModelica required)

```bash
cd backend
uv run python -m libs.simulation.demos.convert_modelica_to_fmu /absolute/path/to/model.mo --model-name MyModel
```

## Notes

- The optional dependency group is `simulation` in `backend/pyproject.toml`.
- FMU simulation requires `fmpy`.
- Modelica conversion requires OpenModelica + `ompython`.
- `samples/` includes CRML-oriented examples (constraint-driven modeling intent) and Modelica examples.
- For CRML package references and modeling conventions, use the OpenModelica CRML package documentation alongside these demos.
