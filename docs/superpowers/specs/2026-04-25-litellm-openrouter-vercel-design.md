# LiteLLM + Mistral AI + Vercel Deployment

**Date:** 2026-04-25
**Model:** `mistral/devstral-latest`

## Goal

Replace the Gemini model backend in the Google ADK agent with LiteLLM routed through Mistral AI, and deploy both the Next.js frontend and Python FastAPI agent on Vercel.

## Architecture

Two separate Vercel projects from the same repository:

```
Vercel project #1 (root: /)           Vercel project #2 (root: agent/)
  Next.js + CopilotKit                   Python FastAPI + Google ADK
  AGENT_URL → project #2 URL              LiteLlm("mistral/devstral-latest")
        |                                           |
        └──── AG-UI / SSE ──────────────────────────┘
                                                    |
                                             Mistral AI API
                                           (devstral-latest)
```

The Next.js API route (`/api/copilotkit`) calls the Python agent over the AG-UI/SSE protocol, unchanged from today. The only difference is the LLM call inside ADK (Gemini → LiteLLM → Mistral AI) and the deployment target (local → Vercel).

## Code Changes

### `agent/main.py`

Add import:
```python
from google.adk.models.lite_llm import LiteLlm
```

Change model in `LlmAgent`:
```python
model=LiteLlm(model="mistral/devstral-latest")
```

Update startup warning to check `MISTRAL_API_KEY` instead of `GOOGLE_API_KEY`. All ADK structure (callbacks, tools, shared state) is unchanged.

### `agent/pyproject.toml`

Add `litellm` to `[project.dependencies]`.

Add entrypoint section so Vercel can discover the FastAPI `app` object (since `main.py` is not one of Vercel's default entrypoints):
```toml
[project.scripts]
app = "main:app"
```

### `.env.example`

```
MISTRAL_API_KEY=your-mistral-api-key
AGENT_URL=http://localhost:8000
```

Remove `OPENAI_API_KEY` — it is unused. The `ExperimentalEmptyAdapter` in `src/app/api/copilotkit/route.ts` does not call any LLM directly.

## Vercel Setup

**Python project** (`doctor-adk-agent` or similar):
- Repo root: `agent/`
- Framework: auto-detected as FastAPI via `pyproject.toml`
- Env var: `MISTRAL_API_KEY` (from [console.mistral.ai](https://console.mistral.ai))

**Next.js project** (`doctor-adk`):
- Repo root: `/`
- Framework: auto-detected as Next.js
- Env var: `AGENT_URL=https://<agent-project>.vercel.app`

Deploy the Python project first to get its URL, then set `AGENT_URL` on the Next.js project.

## Local Development

Unchanged. Run both servers with `npm run dev`. Set `MISTRAL_API_KEY` in `.env` instead of `GOOGLE_API_KEY`.

## Dependencies

`google.adk` imports `google.genai` as a transitive dependency, and `main.py` uses `google.genai.types` directly (`types.Content`, `types.Part`) in the model callbacks. `google-genai` stays as an explicit dependency. It should not require `GOOGLE_API_KEY` at import or initialization time — only at Gemini call time, which is bypassed by `LiteLlm`. Verify locally with only `MISTRAL_API_KEY` set before first Vercel deploy.

## Out of Scope

- CORS configuration — the Python agent is called server-side by the Next.js API route, not from the browser directly
- Streaming timeout tuning — Vercel Python supports SSE/`StreamingResponse`; default limits are sufficient for this use case
