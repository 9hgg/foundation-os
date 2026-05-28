# backend/libs/assistants

Conversation assistant runtime for Opus, built on top of
[ralph](../ralph/README.md) and [ml/llm](../ml/llm/).

## What it does

The assistants lib processes stored conversations in the background and
generates AI replies.  It:

1. Loads a conversation's messages from the database.
2. Optionally fetches tools from an MCP server.
3. Reads Angular frontend routes from a route config file (for route-aware replies).
4. Runs the **Ralph** planner → step-executor → objective-judge pipeline.
5. Saves the reasoning steps as a `assistant-thinking` message and the final
   answer as an `assistant-response` message.

## Components

| File | Purpose |
|------|---------|
| `api.py` | FastAPI router — `POST /api/assistants/process/{conversation_id}` and `GET …/state` |
| `tasks.py` | Background task (`process_assistant_conversation`) driving the Ralph pipeline |
| `config.py` | Pydantic-Settings class (`ASSISTANTS_SETTINGS`) |
| `models.py` | `AssistantProcessState` response model |
| `constants.py` | Kind constants (`_THINKING_KIND`, `_AI_RESPONSE_KIND`, etc.) |
| `mcp.py` | Register assistant-specific MCP tools (e.g. `navigate_to_route`) |
| `methods/llm.py` | `OllamaLLMClient` — sync `LLMClient` for Ollama; `get_llm_client()` factory |
| `methods/messages.py` | Convert DB messages ↔ Ralph format; persist assistant replies |
| `methods/mcp_sync.py` | Sync wrappers around the async MCP protocol for ralph |
| `methods/routes.py` | Parse Angular frontend routes from a TypeScript route config file |
| `methods/users.py` | Mint short-lived JWTs for the triggering user (MCP auth injection) |
| `methods/utils.py` | Task progress update helpers |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ASSISTANT_NAME` | `"The Assistant"` | Display name used in generated messages |
| `ASSISTANT_MODEL` | `"gemma4:e2b"` | Ollama model identifier |
| `ASSISTANT_OLLAMA_BASE_URL` | `"http://localhost:11434/api/chat"` | Ollama chat endpoint |
| `ASSISTANT_LLM_TIMEOUT` | `120.0` | LLM request timeout in seconds |
| `ASSISTANT_MAX_ITERATIONS` | `3` | Max planning steps per task run |
| `ASSISTANT_MAX_TOOL_CALLS` | `25` | Max MCP tool calls per task run |
| `ASSISTANT_MCP_SERVER_URL` | `""` | SSE endpoint of the MCP server; empty = no tools |
| `ASSISTANT_FRONTEND_ROUTE_CONFIG_PATH` | `""` | Absolute path to `app.routes.config.ts` |

## Architecture

```
process_assistant_conversation (background task)
│
├─ load Conversation + Messages from DB
├─ resolve auth token (JWT for MCP)
│
├─ [optional] connect to MCP → list tools → wrap as sync Ralph Tools
├─ [optional] parse Angular route config → frontend_routes: list[str]
│
├─ AutoContextBuilder.build(messages)
│     └─ AssistantRunContext (messages, artifacts, observations, evidences, plan, step_results)
│
├─ ToolRegistry
│     ├─ local harness tools  (get_artifact_structure, read_artifact_property, create_evidence, …)
│     └─ MCP tools           (wrapped with injected auth_token)
│
├─ Ralph pipeline
│     ├─ Planner.plan(ctx, tools)          → Plan
│     ├─ StepExecutor.execute(ctx, step)   → StepResult  (× N)
│     └─ ObjectiveJudge.answer_objective() → ObjectiveAnswer
│
└─ Persist
      ├─ "assistant-thinking"  message (step summaries, markdown)
      └─ "assistant-response"  message (final answer)
```

## Usage

Register the router in your app:

```python
from libs.assistants.api import create_assistant_router

app.include_router(create_assistant_router())
```

Ensure the task is registered by importing the module in your workers file:

```python
import libs.assistants.tasks  # noqa: F401  — registers process_assistant_conversation
```

## MCP tool injection

When `ASSISTANT_MCP_SERVER_URL` is set, the assistant:

1. Connects to the MCP server and lists all available tools.
2. Wraps each tool as a synchronous ralph `Tool`.  Authentication tools
   (`login`, `get_current_user`) are skipped when `auth_token` is available.
3. Automatically injects the `auth_token` into every tool call that accepts it.
4. Enforces `ASSISTANT_MAX_TOOL_CALLS` across the whole task run.

Each MCP tool call opens its own short-lived SSE connection (using `asyncio.run`
in the synchronous task context).  This keeps the implementation simple at the
cost of per-call connection overhead, which is acceptable for background tasks.

## Angular route awareness

Set `ASSISTANT_FRONTEND_ROUTE_CONFIG_PATH` to the absolute path of your Angular
`app.routes.config.ts`.  The assistant parses `path: '…'` declarations and
passes the result to `AutoContextBuilder` as `frontend_routes`.  This makes the
LLM aware of navigable URLs without embedding the entire TypeScript file into
the prompt.

Parsed routes are cached in `/tmp/assistant-routes-<hash>.txt` so the file is
only re-parsed when its content changes.
