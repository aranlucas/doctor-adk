# LiteLLM + Mistral AI + Vercel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Gemini model backend in the Google ADK agent with LiteLLM routed through Mistral AI (`devstral-latest`) and deploy both services on Vercel.

**Architecture:** The Next.js app and Python FastAPI agent are deployed as two separate Vercel projects from the same repo. The model swap is a one-liner in `agent/main.py` — `google.adk`'s native `LiteLlm` wrapper replaces the Gemini model string. The AG-UI/SSE protocol between the two services is unchanged.

**Tech Stack:** Python 3.12, Google ADK, LiteLLM (`google.adk.models.lite_llm.LiteLlm`), FastAPI, Next.js 16, CopilotKit, Vercel

---

## File Map

| File | Change |
|------|--------|
| `agent/pyproject.toml` | Add `litellm` dep, add `[project.scripts]` for Vercel entrypoint discovery, add pytest dev deps and config |
| `agent/main.py` | Add `LiteLlm` import, change model, update startup key warning |
| `agent/tests/__init__.py` | Create (empty, marks test dir as package) |
| `agent/tests/test_agent.py` | Create — tests for health endpoint and LiteLlm model config |
| `.env.example` | Swap `OPENAI_API_KEY`/`GOOGLE_API_KEY` → `MISTRAL_API_KEY` |

---

## Task 1: Initialize git repository

**Files:** none

- [ ] **Step 1: Init git and create .gitignore**

```bash
cd /Users/lucas/Projects/doctor-adk
git init
cat >> .gitignore << 'EOF'
.env
agent/.venv/
__pycache__/
*.pyc
.vercel
EOF
```

- [ ] **Step 2: Initial commit of existing code**

```bash
git add .
git commit -m "chore: initial commit of existing codebase"
```

---

## Task 2: Write failing tests

**Files:**
- Modify: `agent/pyproject.toml`
- Create: `agent/tests/__init__.py`
- Create: `agent/tests/test_agent.py`

- [ ] **Step 1: Add test dependencies and pytest config to `agent/pyproject.toml`**

Replace the file content with:

```toml
[project]
name = "proverbs-agent"
version = "0.1.0"
description = "ADK Proverbs Agent with shared state"
requires-python = ">=3.12"
dependencies = [
  "fastapi",
  "uvicorn[standard]",
  "python-dotenv",
  "pydantic",
  "google-adk",
  "google-genai",
  "ag-ui-adk",
]

[project.optional-dependencies]
dev = ["pytest", "httpx"]

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

- [ ] **Step 2: Install dev dependencies**

```bash
cd agent
uv sync --extra dev
```

Expected: resolves and installs pytest, httpx into the venv.

- [ ] **Step 3: Create test directory**

```bash
mkdir -p agent/tests
touch agent/tests/__init__.py
```

- [ ] **Step 4: Create `agent/tests/test_agent.py`**

```python
from fastapi.testclient import TestClient


def test_health_endpoint():
    from main import app
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_agent_model_is_litellm():
    from google.adk.models.lite_llm import LiteLlm
    from main import proverbs_agent
    assert isinstance(proverbs_agent.model, LiteLlm)


def test_agent_model_string():
    from main import proverbs_agent
    assert proverbs_agent.model.model == "mistral/devstral-latest"
```

- [ ] **Step 5: Run tests and confirm the right ones fail**

```bash
cd agent
uv run pytest tests/ -v
```

Expected output:
```
PASSED  tests/test_agent.py::test_health_endpoint
FAILED  tests/test_agent.py::test_agent_model_is_litellm
FAILED  tests/test_agent.py::test_agent_model_string
```

`test_health_endpoint` passes because the endpoint exists. The model tests fail because `proverbs_agent.model` is currently the string `"gemini-2.5-flash"`, not a `LiteLlm` instance.

---

## Task 3: Implement the LiteLLM swap

**Files:**
- Modify: `agent/pyproject.toml`
- Modify: `agent/main.py`

- [ ] **Step 1: Add `litellm` and Vercel entrypoint to `agent/pyproject.toml`**

The full file should now be:

```toml
[project]
name = "proverbs-agent"
version = "0.1.0"
description = "ADK Proverbs Agent with shared state"
requires-python = ">=3.12"
dependencies = [
  "fastapi",
  "uvicorn[standard]",
  "python-dotenv",
  "pydantic",
  "google-adk",
  "google-genai",
  "ag-ui-adk",
  "litellm",
]

[project.optional-dependencies]
dev = ["pytest", "httpx"]

[project.scripts]
app = "main:app"

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
```

`[project.scripts] app = "main:app"` tells Vercel where to find the FastAPI `app` object — `main.py` is not one of Vercel's auto-detected entrypoints (`app.py`, `index.py`, `server.py`), so this is required for Vercel to serve the app.

- [ ] **Step 2: Sync dependencies**

```bash
cd agent
uv sync --extra dev
```

Expected: installs `litellm` and its dependencies.

- [ ] **Step 3: Update `agent/main.py`**

Make three changes:

1. Add import after the existing imports block (after `from pydantic import ...`):

```python
from google.adk.models.lite_llm import LiteLlm
```

2. In `LlmAgent(...)`, change the `model` argument from:

```python
model="gemini-2.5-flash",
```

to:

```python
model=LiteLlm(model="mistral/devstral-latest"),
```

3. In the `if __name__ == "__main__":` block, change the key warning from:

```python
    if not os.getenv("GOOGLE_API_KEY"):
        print("⚠️  Warning: GOOGLE_API_KEY environment variable not set!")
        print("   Set it with: export GOOGLE_API_KEY='your-key-here'")
        print("   Get a key from: https://makersuite.google.com/app/apikey")
        print()
```

to:

```python
    if not os.getenv("MISTRAL_API_KEY"):
        print("⚠️  Warning: MISTRAL_API_KEY environment variable not set!")
        print("   Set it with: export MISTRAL_API_KEY='your-key-here'")
        print("   Get a key from: https://console.mistral.ai/")
        print()
```

- [ ] **Step 4: Run tests and confirm all pass**

```bash
cd agent
uv run pytest tests/ -v
```

Expected output:
```
PASSED  tests/test_agent.py::test_health_endpoint
PASSED  tests/test_agent.py::test_agent_model_is_litellm
PASSED  tests/test_agent.py::test_agent_model_string

3 passed in X.XXs
```

- [ ] **Step 5: Commit**

```bash
git add agent/pyproject.toml agent/uv.lock agent/main.py agent/tests/
git commit -m "feat: swap Gemini for LiteLLM + Mistral devstral-latest"
```

---

## Task 4: Update environment configuration

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Replace `.env.example` contents**

```
MISTRAL_API_KEY=your-mistral-api-key
AGENT_URL=http://localhost:8000
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "chore: update env example for Mistral API key"
```

---

## Task 5: Smoke-test locally

**Files:** none (runtime verification only)

- [ ] **Step 1: Set your Mistral API key in `.env`**

```bash
# In agent/.env (create if it doesn't exist):
echo "MISTRAL_API_KEY=your-actual-key-here" > agent/.env
```

Get your key from [console.mistral.ai](https://console.mistral.ai) → API Keys.

- [ ] **Step 2: Start the agent**

```bash
cd agent
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

Expected: server starts on port 8000 with no errors, no warnings about missing API key.

- [ ] **Step 3: Confirm health endpoint**

```bash
curl http://localhost:8000/health
```

Expected:
```json
{"status": "ok"}
```

- [ ] **Step 4: Stop the server** (Ctrl+C)

---

## Task 6: Deploy Python agent to Vercel

This task is manual Vercel dashboard + CLI configuration. No code changes.

- [ ] **Step 1: Push to GitHub (required for Vercel Git integration)**

```bash
# Create a repo at github.com, then:
git remote add origin https://github.com/<your-username>/doctor-adk.git
git push -u origin main
```

- [ ] **Step 2: Create the Python Vercel project**

Go to [vercel.com/new](https://vercel.com/new), import the repo, then:
- Set **Root Directory** to `agent`
- Framework Preset: Vercel auto-detects FastAPI — leave as-is
- Click **Deploy**

Vercel reads `pyproject.toml`, installs dependencies, and discovers `app = "main:app"` as the FastAPI entrypoint.

- [ ] **Step 3: Set the Mistral API key env var**

In the Python project dashboard → Settings → Environment Variables:

| Name | Value | Environment |
|------|-------|-------------|
| `MISTRAL_API_KEY` | your key from console.mistral.ai | Production, Preview, Development |

Then **Redeploy** (Deployments tab → three-dot menu → Redeploy).

- [ ] **Step 4: Note the Python project URL**

After deploy, copy the URL — it looks like `https://doctor-adk-agent-<hash>.vercel.app`. You'll need this for Task 7.

- [ ] **Step 5: Verify the deployed health endpoint**

```bash
curl https://<your-python-project-url>/health
```

Expected:
```json
{"status": "ok"}
```

---

## Task 7: Deploy Next.js app to Vercel

- [ ] **Step 1: Create the Next.js Vercel project**

Go to [vercel.com/new](https://vercel.com/new), import the same repo again, then:
- Leave **Root Directory** empty (uses repo root)
- Framework Preset: Next.js (auto-detected)
- Click **Deploy**

- [ ] **Step 2: Set the agent URL env var**

In the Next.js project dashboard → Settings → Environment Variables:

| Name | Value | Environment |
|------|-------|-------------|
| `AGENT_URL` | `https://<your-python-project-url>` from Task 6 Step 4 | Production, Preview, Development |

Then **Redeploy**.

- [ ] **Step 3: Verify end-to-end**

Open the Next.js project URL in a browser. The CopilotKit sidebar should appear. Send the message:

> "Add a proverb about coding."

Expected: the agent responds and the proverb appears in the ProverbsCard. The model is now `devstral-latest` via Mistral AI.

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "chore: all changes deployed to Vercel"
```
