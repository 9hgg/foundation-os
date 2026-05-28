# backend/libs/ralph

Sparse-context assistant runtime for backend workflows.

Low-level LLM calls live in `backend/libs/ml/llm`. Ralph owns orchestration, planning, tools, artifacts, and assistant runtime state.

---

## How it works

Ralph runs a **plan → execute → judge** loop around an objective derived from input messages. The design keeps prompts lean: large values stay in an artifact store and are never injected wholesale into prompts — only metadata and explicit evidence reach the model.

### 1. Context assembly

Before planning starts, `AutoContextBuilder` runs a set of `ContextPreprocessor`s over the input messages. Preprocessors are deterministic enrichers (e.g. fetching a document, resolving an ID) that deposit their results as base artifacts. The builder merges those with any caller-supplied artifacts and static metadata to produce an `AssistantAutoContext`.

### 2. Planning

The `Planner` runs two LLM steps:

1. **Tool inspection** — the model receives a list of available tools and picks which ones need full schema detail.
2. **Plan generation** — the model receives the auto-context, artifact definitions, and detailed tool schemas, then produces a structured `Plan`: an objective string and an ordered list of `PlanStep`s, each naming the tool(s) to use and the expected output.

### 3. Step execution

`StepExecutor` processes each plan step in a **tool-decision loop**:

1. The model is shown the current step goal, available tools, and any observations already collected.
2. It either calls a tool or signals it is done with the step.
3. Tool calls are validated and dispatched. Results are stored as observations (small inline signals) or as named artifacts (larger values).
4. Evidence can be created at any point — evidence is a grounded excerpt extracted from an artifact (property path, filtered list, or comparison) and stored in `EvidenceStore`.
5. An optional **step judge** checks whether the step objective is met before moving on.

Steps repeat until all are complete or a step fails.

### 4. Objective judgment

`ObjectiveJudge` runs a final LLM call that reads **only explicit evidences** (not raw artifacts) and answers whether the overall objective was satisfied, with a rationale and — on failure — a list of missing information.

### 5. Replanning on failure

If the objective judge returns failure, `AssistantRunner` can replan (up to `max_replan_attempts`, default 2). It builds a failure context from all step results and reruns planning and execution.

---

## Key components

| Component | Path | Role |
| --- | --- | --- |
| `Assistant` | `assistants/base_assistant.py` | Thin public facade |
| `AssistantRunner` | `execution/runner.py` | Orchestrates the full loop |
| `AutoContextBuilder` | `context/auto_context.py` | Builds sparse runtime context |
| `Planner` | `planning/planner.py` | Two-phase plan generation |
| `StepExecutor` | `execution/step_executor.py` | Tool-decision loop per step |
| `ObjectiveJudge` | `execution/objective_judge.py` | Final evidence-based answer |
| `ArtifactStore` | `state/artifacts.py` | Named runtime values, lazy-loadable |
| `EvidenceStore` | `evidence/evidence.py` | Grounded excerpts for judging |
| `ObservationStore` | `observations/observations.py` | Bounded inline tool outputs |
| `ToolRegistry` | `tools/tool_registry.py` | Name-indexed callable tools |

---

## Artifacts vs evidence vs observations

- **Artifact** — an arbitrary runtime value (document, list, record). Never injected raw into a prompt; the model accesses it through local tools.
- **Evidence** — a replayable, bounded excerpt extracted from an artifact (e.g. `artifact.field[0].name`, a filtered sublist, a comparison). Only evidence reaches the objective judge.
- **Observation** — a small inline output produced by a tool call and appended to the current step's context. Ephemeral and prompt-safe.

---

## Local tools

Ralph ships a set of built-in tools the model can always call:

| Group | Tools |
| --- | --- |
| Artifact navigation | `read_artifact_property`, `get_artifact_structure` |
| Evidence creation | `create_evidence`, `create_comparison_evidence` |
| List operations | `filter_items`, `count_items`, `sort_items`, `slice_items`, `distinct_values`, `get_first` |
| Aggregations | `sum_items`, `average_items`, `min_item`, `max_item`, `compute`, `round_value` |
| Persistence | `create_constant_value`, `save_artifact` |

`filter_items` and related list tools use a declarative `FilterCondition` model (operators: `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `contains`, `in`, `not_in`, `exists`) so the model never executes arbitrary code.
`slice_items` is the built-in list-splitting helper for top-N, windowing, and Python-style list slicing.

Domain-specific tools are registered via `ToolRegistry` and passed to the runner alongside the local ones.

---

## Runnable script suites

For deterministic Ralph tool demos that do not call an LLM, run:

```bash
python3 -m libs.ralph.tests.llm_based.run_all
python3 -m libs.ralph.tests.tools.run_all
```

- `libs.ralph.tests.llm_based.run_all` runs each scenario through `AssistantRunner` with a real LLM client. Configure it with `RALPH_LLM_PROVIDER=ollama|openai`, `RALPH_LLM_MODEL`, and optionally `RALPH_OLLAMA_BASE_URL` or `RALPH_OPENAI_API_KEY_ENV` (default: `OPENAI_API_KEY_EXTRACT_TEST`).
- `libs.ralph.tests.tools.run_all` executes the same scenarios from raw JSON tool call payloads.
- Both suites use predefined artifacts and fail fast with assertions if a tool behavior changes.

---

## Artifact references

Tools accept artifact references instead of inline values:

```python
{"artifact_ref": "my_artifact_key"}
```

The executor resolves the reference before calling the tool, keeping large values out of the model's output.

Nested property access uses dot/bracket notation:

```python
{"artifact_ref": "my_artifact_key.items[0].title"}
```

---

## Tracing

`RalphRichTracer` logs the full execution using Rich panels — planning phase, each step's tool calls and observations, step judge verdicts, and the final objective answer. Pass a tracer instance to `AssistantRunner` for local debugging.
