# Trip-First ADK MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a trip-first travel planner by reusing one `trvl` MCP endpoint with filtered ADK toolsets per specialized agent and shared state that the frontend can render.

**Architecture:** `agent/main.py` will expose a root `travel_concierge_agent` with focused sub-agents. MCP results will be normalized into both legacy result arrays and a canonical `active_trip`. The frontend will add typed selectors and render `active_trip` while retaining existing flight/date views.

**Tech Stack:** Python 3.12+, Google ADK, `ag-ui-adk`, `McpToolset`, FastAPI, TypeScript, React 19, Next.js 16, CopilotKit.

---

## File Map

- Modify `agent/main.py`: filtered MCP toolset helper, sub-agent definitions, expanded callback normalization.
- Create `agent/tests/test_trip_state.py`: unit tests for Python normalization helpers.
- Modify `agent/pyproject.toml`: ensure `pytest` path already supports tests.
- Modify `src/lib/types.ts`: add `ActiveTrip`, hotel, route, and viability state types.
- Modify `src/lib/state.ts`: add selectors and runtime guards for new state.
- Create `src/lib/state.test.ts`: tests for new selectors if a TS test runner exists; otherwise keep selector logic simple and verify through `npm run build`.
- Modify `src/components/results-canvas.tsx`: render active trip summary sections above existing result cards.

## Task 1: Extract Python Normalization Helpers

**Files:**
- Modify: `agent/main.py`
- Create: `agent/tests/test_trip_state.py`

- [ ] **Step 1: Write failing tests for active trip merging**

Create `agent/tests/test_trip_state.py`:

```python
from main import merge_active_trip


def test_merge_active_trip_preserves_existing_sections():
    current = {
        "origin": "SEA",
        "transport": {"options": [{"price": 120, "currency": "USD", "legs": []}]},
        "updated_at": 1,
    }

    merged = merge_active_trip(
        current,
        {
            "destination": "SFO",
            "lodging": {"options": [{"name": "Hotel A", "price": 180, "currency": "USD"}]},
        },
        now=2,
    )

    assert merged["origin"] == "SEA"
    assert merged["destination"] == "SFO"
    assert merged["transport"]["options"][0]["price"] == 120
    assert merged["lodging"]["options"][0]["name"] == "Hotel A"
    assert merged["updated_at"] == 2
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd agent
.venv/bin/pytest tests/test_trip_state.py::test_merge_active_trip_preserves_existing_sections -v
```

Expected: FAIL because `merge_active_trip` is not defined.

- [ ] **Step 3: Implement minimal merge helper**

Add to `agent/main.py` near existing helper functions:

```python
def merge_active_trip(
    current: dict[str, Any] | None,
    patch: dict[str, Any],
    *,
    now: int | None = None,
) -> dict[str, Any]:
    """Merge a normalized trip patch without dropping existing sections."""
    merged: dict[str, Any] = dict(current or {})
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    merged["updated_at"] = int(time.time()) if now is None else now
    return merged
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd agent
.venv/bin/pytest tests/test_trip_state.py::test_merge_active_trip_preserves_existing_sections -v
```

Expected: PASS.

## Task 2: Add Filtered MCP Sub-Agents

**Files:**
- Modify: `agent/main.py`

- [ ] **Step 1: Write failing test for toolset helper**

Append to `agent/tests/test_trip_state.py`:

```python
from main import DISCOVERY_TOOLS, LODGING_TOOLS, PROFILE_TOOLS, TRANSPORT_TOOLS, VIABILITY_TOOLS


def test_tool_groups_are_disjoint_enough_for_routing():
    assert "get_preferences" in PROFILE_TOOLS
    assert "search_flights" in TRANSPORT_TOOLS
    assert "search_hotels" in LODGING_TOOLS
    assert "assess_trip" in VIABILITY_TOOLS
    assert "weekend_getaway" in DISCOVERY_TOOLS
    assert "configure_provider" not in PROFILE_TOOLS + TRANSPORT_TOOLS + LODGING_TOOLS + VIABILITY_TOOLS + DISCOVERY_TOOLS
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd agent
.venv/bin/pytest tests/test_trip_state.py::test_tool_groups_are_disjoint_enough_for_routing -v
```

Expected: FAIL because tool group constants are not defined.

- [ ] **Step 3: Add tool groups and helper**

Add constants and helper in `agent/main.py`:

```python
PROFILE_TOOLS = ["get_preferences", "update_preferences", "build_profile", "onboard_profile", "interview_trip"]
DISCOVERY_TOOLS = ["weekend_getaway", "suggest_dates", "search_dates", "search_deals", "destination_info", "travel_guide", "get_weather", "local_events"]
TRANSPORT_TOOLS = ["search_flights", "plan_flight_bundle", "find_interactive", "search_route", "search_ground", "search_airport_transfers", "get_baggage_rules", "search_lounges"]
LODGING_TOOLS = ["search_hotels", "search_hotel_by_name", "hotel_rooms", "hotel_prices", "hotel_reviews", "detect_accommodation_hacks"]
VIABILITY_TOOLS = ["assess_trip", "calculate_trip_cost", "check_visa", "calculate_points_value", "detect_travel_hacks", "optimize_booking", "optimize_trip_dates", "find_trip_window", "optimize_multi_city"]
ITINERARY_TOOLS = ["create_trip", "list_trips", "get_trip", "add_trip_leg", "mark_trip_booked", "export_ics", "watch_price", "watch_room_availability"]


def trvl_toolset(names: list[str]) -> McpToolset:
    return McpToolset(
        connection_params=StreamableHTTPConnectionParams(
            url=TRVL_MCP_URL,
            timeout=30.0,
        ),
        tool_filter=names,
        use_mcp_resources=True,
    )
```

- [ ] **Step 4: Replace single-agent setup**

Replace `trvl_toolset = McpToolset(...)` and `flight_agent = LlmAgent(...)` with sub-agents:

```python
profile_agent = LlmAgent(name="profile_agent", model=LiteLlm(model="mistral/devstral-latest"), instruction=PROFILE_INSTRUCTION, tools=[trvl_toolset(PROFILE_TOOLS)])
discovery_agent = LlmAgent(name="discovery_agent", model=LiteLlm(model="mistral/devstral-latest"), after_tool_callback=after_tool_callback, instruction=DISCOVERY_INSTRUCTION, tools=[trvl_toolset(DISCOVERY_TOOLS)])
transport_agent = LlmAgent(name="transport_agent", model=LiteLlm(model="mistral/devstral-latest"), after_tool_callback=after_tool_callback, instruction=TRANSPORT_INSTRUCTION, tools=[trvl_toolset(TRANSPORT_TOOLS)])
lodging_agent = LlmAgent(name="lodging_agent", model=LiteLlm(model="mistral/devstral-latest"), after_tool_callback=after_tool_callback, instruction=LODGING_INSTRUCTION, tools=[trvl_toolset(LODGING_TOOLS)])
viability_agent = LlmAgent(name="viability_agent", model=LiteLlm(model="mistral/devstral-latest"), after_tool_callback=after_tool_callback, instruction=VIABILITY_INSTRUCTION, tools=[trvl_toolset(VIABILITY_TOOLS)])
itinerary_agent = LlmAgent(name="itinerary_agent", model=LiteLlm(model="mistral/devstral-latest"), after_tool_callback=after_tool_callback, instruction=ITINERARY_INSTRUCTION, tools=[trvl_toolset(ITINERARY_TOOLS)])

travel_concierge_agent = LlmAgent(
    name="travel_concierge_agent",
    model=LiteLlm(model="mistral/devstral-latest"),
    instruction=ROOT_INSTRUCTION,
    tools=[get_current_date],
    sub_agents=[profile_agent, discovery_agent, transport_agent, lodging_agent, viability_agent, itinerary_agent],
)
```

- [ ] **Step 5: Run tests**

Run:

```bash
cd agent
.venv/bin/pytest tests/test_trip_state.py -v
```

Expected: PASS.

## Task 3: Normalize MCP Results Into Active Trip

**Files:**
- Modify: `agent/main.py`
- Modify: `agent/tests/test_trip_state.py`

- [ ] **Step 1: Write failing tests for hotel and viability patches**

Append:

```python
from main import normalize_trip_patch


def test_normalize_trip_patch_for_hotels():
    patch = normalize_trip_patch(
        "search_hotels",
        {"location": "San Francisco", "check_in": "2026-05-01", "check_out": "2026-05-03"},
        {"success": True, "hotels": [{"name": "Hotel A", "price": 180, "currency": "USD"}]},
    )

    assert patch["destination"] == "San Francisco"
    assert patch["lodging"]["options"][0]["name"] == "Hotel A"


def test_normalize_trip_patch_for_assess_trip():
    patch = normalize_trip_patch(
        "assess_trip",
        {"origin": "SEA", "destination": "SFO"},
        {"success": True, "verdict": "viable", "checks": [{"dimension": "visa", "status": "ok", "summary": "No visa required"}], "total_cost": 500, "currency": "USD"},
    )

    assert patch["origin"] == "SEA"
    assert patch["destination"] == "SFO"
    assert patch["viability"]["verdict"] == "viable"
    assert patch["viability"]["total_cost"] == 500
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd agent
.venv/bin/pytest tests/test_trip_state.py::test_normalize_trip_patch_for_hotels tests/test_trip_state.py::test_normalize_trip_patch_for_assess_trip -v
```

Expected: FAIL because `normalize_trip_patch` is not defined.

- [ ] **Step 3: Implement normalization**

Add `normalize_trip_patch` in `agent/main.py` and call it from `after_tool_callback` after parsing successful MCP data. Store the merged object at `tool_context.state["active_trip"]`.

- [ ] **Step 4: Run tests**

Run:

```bash
cd agent
.venv/bin/pytest tests/test_trip_state.py -v
```

Expected: PASS.

## Task 4: Add Frontend Types and Selectors

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/state.ts`

- [ ] **Step 1: Add TypeScript types**

Add `ActiveTrip`, `HotelOption`, `RouteOption`, `ViabilityCheck`, `StoredHotelResult`, `StoredRouteResult`, and `StoredViabilityResult` to `src/lib/types.ts`.

- [ ] **Step 2: Add selectors**

Add these functions to `src/lib/state.ts`:

```ts
export function getActiveTrip(state: AgentState): ActiveTrip | null;
export function getHotelResults(state: AgentState): StoredHotelResult[];
export function getRouteResults(state: AgentState): StoredRouteResult[];
export function getViabilityResults(state: AgentState): StoredViabilityResult[];
```

Use runtime guards like the existing `isFlightResult` and `isDateResult`.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: TypeScript compilation succeeds.

## Task 5: Render Trip-First UI Sections

**Files:**
- Modify: `src/components/results-canvas.tsx`

- [ ] **Step 1: Add `ActiveTripCard`**

Create a compact section that displays destination, dates, guests, viability verdict, estimated total cost, top flight, and top hotel from `active_trip`.

- [ ] **Step 2: Render above existing cards**

In `ResultsCanvas`, call `getActiveTrip(state)` and render `ActiveTripCard` before `LeaderboardCard`.

- [ ] **Step 3: Verify UI build**

Run:

```bash
npm run build
```

Expected: production build succeeds.

## Task 6: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run Python tests**

Run:

```bash
cd agent
.venv/bin/pytest -v
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Smoke test MCP tool listing**

Run:

```bash
curl -sS -X POST "https://trvl-production.up.railway.app/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"codex-smoke","version":"1.0.0"}}}'
```

Expected: response includes `"serverInfo":{"name":"trvl"`.

## Self-Review

- Spec coverage: filtered toolsets, sub-agents, active trip state, raw histories, frontend selectors, and verification are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: state names match the approved design: `active_trip`, `hotel_results`, `route_results`, `viability_results`.
