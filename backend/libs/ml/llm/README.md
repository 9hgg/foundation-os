# backend/libs/ml/llm

Low-level LLM invocation package.

## Responsibilities

- Provider transport interface.
- Basic completions.
- Structured / instructor-constrained responses.
- Retry and schema validation.

This package should not know about assistant tools, plans, artifacts, or backend orchestration details.
