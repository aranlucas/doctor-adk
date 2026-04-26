# Shared State Results Canvas + 3D Globe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace sidebar `useRenderToolCall` rendering with a full-bleed 3D globe canvas (react-globe.gl) and scrollable overlay panel that accumulates flight/date search results via ADK shared state (`useCoAgent`).

**Architecture:** An `after_tool_callback` on the ADK `LlmAgent` intercepts `search_flights` / `search_dates` tool results and appends them to session state. `ag_ui_adk` automatically includes session state in the `STATE_SNAPSHOT` event sent to the frontend. The frontend reads it with `useCoAgent`, derives arc data from stored destinations, and renders a `GlobeCanvas` (react-globe.gl) with a scrollable overlay panel of result cards.

**Tech Stack:** Python 3.12, Google ADK, ag_ui_adk, pytest · Next.js 16, React 19, CopilotKit 1.55, react-globe.gl, TypeScript

---

## File Map

| File | Role |
|------|------|
| `agent/main.py` | Add `after_tool_callback`; pass to `LlmAgent` |
| `agent/tests/__init__.py` | Makes tests/ a package |
| `agent/tests/test_callback.py` | Tests for `after_tool_callback` parsing/storage |
| `src/lib/types.ts` | Add `AgentState`, `StoredFlightResult`, `StoredDateResult`, `ArcDatum` |
| `src/lib/airports.ts` | Static IATA → `{ lat, lng }` lookup |
| `src/lib/arcs.ts` | Pure function: derive `ArcDatum[]` from agent state |
| `src/components/globe-canvas.tsx` | react-globe.gl wrapper, client-only, SSR disabled |
| `src/components/results-canvas.tsx` | Globe + overlay panel composition |
| `src/app/page.tsx` | Add `useCoAgent`, remove `useRenderToolCall`, render `<ResultsCanvas>` |

---

## Task 1: Agent — `after_tool_callback`

**Files:**
- Modify: `agent/main.py`
- Create: `agent/tests/__init__.py`
- Create: `agent/tests/test_callback.py`

- [ ] **Step 1: Create test directory and empty `__init__.py`**

```bash
mkdir -p /Users/lucas/Projects/doctor-adk/agent/tests
touch /Users/lucas/Projects/doctor-adk/agent/tests/__init__.py
```

- [ ] **Step 2: Install pytest-asyncio dev dependency**

```bash
cd /Users/lucas/Projects/doctor-adk/agent
uv add --dev pytest pytest-asyncio httpx
```

Add to `pyproject.toml` (uv does this automatically):
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
asyncio_mode = "auto"
```

Update `pyproject.toml` manually to add `asyncio_mode`:
```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
asyncio_mode = "auto"
```

- [ ] **Step 3: Write failing tests for `after_tool_callback`**

Create `agent/tests/test_callback.py`:

```python
import json
import pytest
from unittest.mock import MagicMock


def make_mcp_response(data: dict) -> dict:
    return {"content": [{"type": "text", "text": json.dumps(data)}]}


def make_tool(name: str):
    t = MagicMock()
    t.name = name
    return t


def make_ctx(initial: dict | None = None) -> MagicMock:
    ctx = MagicMock()
    ctx.state = dict(initial or {})
    return ctx


FLIGHT_RESPONSE = make_mcp_response({
    "success": True,
    "flights": [
        {"price": 134.0, "stops": 0, "duration_min": 100,
         "legs": [{"departure_airport": "SEA", "arrival_airport": "SFO",
                   "departure_datetime": "2026-04-26T06:00:00",
                   "arrival_datetime": "2026-04-26T07:45:00",
                   "airline": "Alaska Airlines", "flight_number": "AS123",
                   "airline_code": "AS"}]}
    ],
})

DATE_RESPONSE = make_mcp_response({
    "success": True,
    "cheapest_dates": [
        {"date": "2026-04-26", "price": 89.0},
        {"date": "2026-05-03", "price": 112.0},
    ],
})


async def test_flight_result_appended_to_state():
    from main import after_tool_callback
    tool = make_tool("search_flights")
    args = {"origin": "SEA", "destination": "SFO", "departure_date": "2026-04-26"}
    ctx = make_ctx()

    result = await after_tool_callback(tool, args, ctx, FLIGHT_RESPONSE)

    assert result is None
    assert "flight_results" in ctx.state
    assert len(ctx.state["flight_results"]) == 1
    entry = ctx.state["flight_results"][0]
    assert entry["args"] == args
    assert len(entry["flights"]) == 1
    assert entry["flights"][0]["price"] == 134.0
    assert "id" in entry
    assert "ts" in entry


async def test_date_result_appended_to_state():
    from main import after_tool_callback
    tool = make_tool("search_dates")
    args = {"origin": "SEA", "destination": "LAS"}
    ctx = make_ctx()

    result = await after_tool_callback(tool, args, ctx, DATE_RESPONSE)

    assert result is None
    assert "date_results" in ctx.state
    assert len(ctx.state["date_results"]) == 1
    entry = ctx.state["date_results"][0]
    assert len(entry["dates"]) == 2
    assert entry["dates"][0]["price"] == 89.0


async def test_failed_result_not_stored():
    from main import after_tool_callback
    tool = make_tool("search_flights")
    ctx = make_ctx()
    args = {"origin": "SEA", "destination": "SFO", "departure_date": "2026-04-26"}
    bad_response = make_mcp_response({"success": False, "error": "Invalid parameter", "flights": []})

    await after_tool_callback(tool, args, ctx, bad_response)

    assert ctx.state.get("flight_results") is None


async def test_unrelated_tool_ignored():
    from main import after_tool_callback
    tool = make_tool("get_current_date")
    ctx = make_ctx()

    result = await after_tool_callback(tool, {}, ctx, {"content": [{"type": "text", "text": "2026-04-25"}]})

    assert result is None
    assert "flight_results" not in ctx.state
    assert "date_results" not in ctx.state


async def test_results_accumulate_across_calls():
    from main import after_tool_callback
    tool = make_tool("search_flights")
    ctx = make_ctx()
    args1 = {"origin": "SEA", "destination": "SFO", "departure_date": "2026-04-26"}
    args2 = {"origin": "SEA", "destination": "LAX", "departure_date": "2026-04-26"}

    await after_tool_callback(tool, args1, ctx, FLIGHT_RESPONSE)
    await after_tool_callback(tool, args2, ctx, FLIGHT_RESPONSE)

    assert len(ctx.state["flight_results"]) == 2
    assert ctx.state["flight_results"][0]["args"]["destination"] == "SFO"
    assert ctx.state["flight_results"][1]["args"]["destination"] == "LAX"
```

- [ ] **Step 4: Run tests and confirm they fail**

```bash
cd /Users/lucas/Projects/doctor-adk/agent
uv run pytest tests/test_callback.py -v
```

Expected: `ImportError` or `AttributeError` — `after_tool_callback` does not exist yet.

- [ ] **Step 5: Implement `after_tool_callback` in `agent/main.py`**

Add after the `get_current_date` function and before `load_dotenv()`:

```python
import json
import time
from uuid import uuid4
from typing import Any, Optional


async def after_tool_callback(
    tool: Any,
    args: dict[str, Any],
    tool_context: Any,
    tool_response: dict[str, Any],
) -> Optional[dict[str, Any]]:
    if tool.name not in ("search_flights", "search_dates"):
        return None

    try:
        text = tool_response.get("content", [{}])[0].get("text", "{}")
        data = json.loads(text)
    except (json.JSONDecodeError, IndexError, KeyError, TypeError):
        return None

    if not data.get("success"):
        return None

    if tool.name == "search_flights":
        key = "flight_results"
        entry = {
            "id": str(uuid4()),
            "args": args,
            "flights": data.get("flights", []),
            "ts": int(time.time()),
        }
    else:
        key = "date_results"
        entry = {
            "id": str(uuid4()),
            "args": args,
            "dates": data.get("dates") or data.get("cheapest_dates") or [],
            "ts": int(time.time()),
        }

    current = list(tool_context.state.get(key) or [])
    current.append(entry)
    tool_context.state[key] = current
    return None
```

- [ ] **Step 6: Wire `after_tool_callback` into `LlmAgent`**

In `agent/main.py`, update the `LlmAgent(...)` call to add `after_tool_callback=after_tool_callback`:

```python
flight_agent = LlmAgent(
    name="FlightAgent",
    model=LiteLlm(model="mistral/devstral-latest"),
    after_tool_callback=after_tool_callback,
    instruction="""You are a weekend trip flight planner for someone based in Seattle, WA.
Always call get_current_date at the start of every conversation to get today's date before calculating any weekend dates.
The user's home airport is Seattle-Tacoma International (SEA). Always use SEA as the departure airport unless the user explicitly says otherwise.

Use the search_flights tool to find flights on a specific date between two airports.
Use the search_dates tool to find the cheapest travel dates across a flexible date range.

Guidelines:
- Always use IATA airport codes (e.g. SEA, SFO, LAX, ORD, JFK, LAS, PDX)
- If the user gives a city name, infer the primary airport code
- Default departure is SEA (Seattle-Tacoma International)
- For specific date queries, use search_flights
- For flexible date queries ("cheapest weekend", "when is it cheapest"), use search_dates
- Weekend trips are typically Friday–Sunday or Saturday–Sunday, so suggest nearby weekends when dates are vague
- Ask only for the destination and preferred weekend if not provided — never ask for origin since it defaults to SEA
- Present results conversationally — highlight best price, shortest flight, and direct options
- Suggest popular weekend destinations from Seattle: San Francisco, Los Angeles, Las Vegas, Portland, Boise, Vancouver BC, Phoenix, Denver, New York
- Mention stops, duration, and airline for the top results
""",
    tools=[
        get_current_date,
        McpToolset(
            connection_params=StdioConnectionParams(
                server_params=StdioServerParameters(
                    command="fli-mcp",
                    args=[],
                )
            )
        )
    ],
)
```

- [ ] **Step 7: Run tests and confirm they all pass**

```bash
cd /Users/lucas/Projects/doctor-adk/agent
uv run pytest tests/test_callback.py -v
```

Expected:
```
PASSED tests/test_callback.py::test_flight_result_appended_to_state
PASSED tests/test_callback.py::test_date_result_appended_to_state
PASSED tests/test_callback.py::test_failed_result_not_stored
PASSED tests/test_callback.py::test_unrelated_tool_ignored
PASSED tests/test_callback.py::test_results_accumulate_across_calls
5 passed
```

- [ ] **Step 8: Commit**

```bash
cd /Users/lucas/Projects/doctor-adk
git add agent/main.py agent/pyproject.toml agent/uv.lock agent/tests/
git commit -m "feat: after_tool_callback stores flight/date results in session state"
```

---

## Task 2: Frontend types and airport lookup

**Files:**
- Modify: `src/lib/types.ts`
- Create: `src/lib/airports.ts`
- Create: `src/lib/arcs.ts`

- [ ] **Step 1: Add new types to `src/lib/types.ts`**

Append to the existing file (keep all existing types):

```typescript
// --- Shared agent state (useCoAgent) ---

export interface StoredFlightResult {
  id: string;
  args: Record<string, string>;
  flights: Flight[];
  ts: number;
}

export interface StoredDateResult {
  id: string;
  args: Record<string, string>;
  dates: DatePrice[];
  ts: number;
}

export interface AgentState {
  flight_results?: StoredFlightResult[];
  date_results?: StoredDateResult[];
}

export interface ArcDatum {
  id: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  strokeWidth: number;
}
```

- [ ] **Step 2: Create `src/lib/airports.ts`**

```typescript
export interface AirportCoord {
  lat: number;
  lng: number;
}

export const AIRPORTS: Record<string, AirportCoord> = {
  SEA: { lat: 47.4502, lng: -122.3088 },
  SFO: { lat: 37.6213, lng: -122.379 },
  LAX: { lat: 33.9425, lng: -118.4081 },
  LAS: { lat: 36.084, lng: -115.1537 },
  DEN: { lat: 39.8561, lng: -104.6737 },
  ORD: { lat: 41.9742, lng: -87.9073 },
  JFK: { lat: 40.6413, lng: -73.7781 },
  PDX: { lat: 45.5898, lng: -122.5951 },
  PHX: { lat: 33.4373, lng: -112.0078 },
  BOI: { lat: 43.5644, lng: -116.2228 },
  YVR: { lat: 49.1967, lng: -123.1815 },
  SAN: { lat: 32.7338, lng: -117.1933 },
  MIA: { lat: 25.7959, lng: -80.287 },
  BOS: { lat: 42.3656, lng: -71.0096 },
  ATL: { lat: 33.6407, lng: -84.4277 },
  ANC: { lat: 61.1743, lng: -149.996 },
  HNL: { lat: 21.3245, lng: -157.9251 },
  MSP: { lat: 44.8848, lng: -93.2223 },
  SLC: { lat: 40.7884, lng: -111.9778 },
  OAK: { lat: 37.7213, lng: -122.2208 },
  SJC: { lat: 37.3626, lng: -121.9291 },
  SMF: { lat: 38.6954, lng: -121.5908 },
  RNO: { lat: 39.4991, lng: -119.7681 },
  ABQ: { lat: 35.0402, lng: -106.6091 },
  TUS: { lat: 32.1161, lng: -110.9410 },
  EUG: { lat: 44.1246, lng: -123.2120 },
  MFR: { lat: 42.3742, lng: -122.8735 },
  GEG: { lat: 47.6199, lng: -117.5339 },
};
```

- [ ] **Step 3: Create `src/lib/arcs.ts`**

```typescript
import { AgentState, ArcDatum, StoredFlightResult, StoredDateResult } from "./types";
import { AIRPORTS } from "./airports";

const SEA = AIRPORTS["SEA"];
const ARC_COLOR_LATEST = "#F59E0B";
const ARC_COLOR_OLD = "rgba(255,255,255,0.2)";

export function deriveArcs(state: AgentState): ArcDatum[] {
  const flights = state.flight_results ?? [];
  const dates = state.date_results ?? [];

  type Entry = { id: string; dest: string; ts: number };
  const entries: Entry[] = [
    ...flights.map((r: StoredFlightResult) => ({
      id: r.id,
      dest: r.args.destination ?? r.args.arrival_airport ?? "",
      ts: r.ts,
    })),
    ...dates.map((r: StoredDateResult) => ({
      id: r.id,
      dest: r.args.destination ?? r.args.arrival_airport ?? "",
      ts: r.ts,
    })),
  ];

  if (entries.length === 0) return [];

  const maxTs = Math.max(...entries.map((e) => e.ts));

  return entries.flatMap((entry): ArcDatum[] => {
    const dst = AIRPORTS[entry.dest.toUpperCase()];
    if (!dst) return [];
    const isLatest = entry.ts === maxTs;
    return [
      {
        id: entry.id,
        startLat: SEA.lat,
        startLng: SEA.lng,
        endLat: dst.lat,
        endLng: dst.lng,
        color: isLatest ? ARC_COLOR_LATEST : ARC_COLOR_OLD,
        strokeWidth: isLatest ? 1.5 : 0.8,
      },
    ];
  });
}
```

- [ ] **Step 4: Commit**

```bash
cd /Users/lucas/Projects/doctor-adk
git add src/lib/types.ts src/lib/airports.ts src/lib/arcs.ts
git commit -m "feat: add AgentState types, airport coords, arc derivation"
```

---

## Task 3: Install react-globe.gl

**Files:**
- Modify: `package.json`, lockfile

- [ ] **Step 1: Install the package**

```bash
cd /Users/lucas/Projects/doctor-adk
npm install react-globe.gl
```

- [ ] **Step 2: Confirm it installed**

```bash
node -e "require('react-globe.gl'); console.log('ok')"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
cd /Users/lucas/Projects/doctor-adk
git add package.json package-lock.json
git commit -m "chore: add react-globe.gl"
```

---

## Task 4: `GlobeCanvas` component

**Files:**
- Create: `src/components/globe-canvas.tsx`

- [ ] **Step 1: Create `src/components/globe-canvas.tsx`**

```tsx
"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import type { ArcDatum } from "@/lib/types";

const Globe = dynamic(() => import("react-globe.gl"), { ssr: false });

interface GlobeCanvasProps {
  arcs: ArcDatum[];
}

export function GlobeCanvas({ arcs }: GlobeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });
  const globeRef = useRef<{ controls: () => { autoRotate: boolean; autoRotateSpeed: number } } | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Pause auto-rotate for 3s whenever new arcs arrive, then resume
  useEffect(() => {
    if (arcs.length === 0) return;
    const controls = globeRef.current?.controls();
    if (controls) controls.autoRotate = false;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      const c = globeRef.current?.controls();
      if (c) c.autoRotate = true;
    }, 3000);
    return () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [arcs.length]);

  const onGlobeReady = useCallback(() => {
    const controls = globeRef.current?.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
    }
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
    >
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        atmosphereAltitude={0.12}
        atmosphereColor="rgba(245,158,11,0.15)"
        arcsData={arcs}
        arcStartLat={(d) => (d as ArcDatum).startLat}
        arcStartLng={(d) => (d as ArcDatum).startLng}
        arcEndLat={(d) => (d as ArcDatum).endLat}
        arcEndLng={(d) => (d as ArcDatum).endLng}
        arcColor={(d) => (d as ArcDatum).color}
        arcAltitude={0.3}
        arcStroke={(d) => (d as ArcDatum).strokeWidth}
        arcDashLength={0.4}
        arcDashGap={0.2}
        arcDashAnimateTime={1500}
        onGlobeReady={onGlobeReady}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles with no errors**

```bash
cd /Users/lucas/Projects/doctor-adk
npx tsc --noEmit
```

Expected: no errors (the `ignoreBuildErrors` in `next.config.ts` only applies to build, not `tsc --noEmit` — fix any genuine type errors).

- [ ] **Step 3: Commit**

```bash
cd /Users/lucas/Projects/doctor-adk
git add src/components/globe-canvas.tsx
git commit -m "feat: GlobeCanvas with react-globe.gl, auto-rotate, animated arcs"
```

---

## Task 5: `ResultsCanvas` component

**Files:**
- Create: `src/components/results-canvas.tsx`

- [ ] **Step 1: Create `src/components/results-canvas.tsx`**

```tsx
"use client";

import { AgentState, StoredFlightResult, StoredDateResult } from "@/lib/types";
import { deriveArcs } from "@/lib/arcs";
import { GlobeCanvas } from "./globe-canvas";
import { FlightCard } from "./flight-card";

type ResultEntry =
  | { kind: "flight"; data: StoredFlightResult }
  | { kind: "date"; data: StoredDateResult };

function mergeAndSort(state: AgentState): ResultEntry[] {
  const flights: ResultEntry[] = (state.flight_results ?? []).map((r) => ({
    kind: "flight",
    data: r,
  }));
  const dates: ResultEntry[] = (state.date_results ?? []).map((r) => ({
    kind: "date",
    data: r,
  }));
  return [...flights, ...dates].sort((a, b) => b.data.ts - a.data.ts);
}

function RouteHeader({ args }: { args: Record<string, string> }) {
  const from = args.origin ?? args.departure_airport ?? "SEA";
  const to = args.destination ?? args.arrival_airport ?? "???";
  const date = args.departure_date ?? args.date ?? "";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        marginBottom: "0.75rem",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.4rem",
          fontWeight: 600,
          color: "var(--cream)",
          letterSpacing: "0.04em",
        }}
      >
        {from}
      </span>
      <span style={{ color: "var(--amber)" }}>→</span>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "1.4rem",
          fontWeight: 600,
          color: "var(--cream)",
          letterSpacing: "0.04em",
        }}
      >
        {to}
      </span>
      {date && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.6rem",
            color: "var(--cream-muted)",
            letterSpacing: "0.08em",
            marginLeft: "auto",
          }}
        >
          {date}
        </span>
      )}
    </div>
  );
}

function DateCard({ data, isLatest }: { data: StoredDateResult; isLatest: boolean }) {
  const { args, dates } = data;
  const sorted = [...dates].sort((a, b) => a.price - b.price);
  return (
    <div
      style={{
        background: "rgba(7,8,10,0.82)",
        border: `1px solid ${isLatest ? "var(--amber)" : "var(--border)"}`,
        borderLeft: `2px solid ${isLatest ? "var(--amber)" : "transparent"}`,
        borderRadius: "0.75rem",
        padding: "1.1rem",
        opacity: isLatest ? 1 : 0.5,
      }}
    >
      <RouteHeader args={args} />
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "0.6rem",
          color: "var(--cream-muted)",
          letterSpacing: "0.12em",
          marginBottom: "0.75rem",
        }}
      >
        CHEAPEST DATES
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {sorted.slice(0, 6).map((d) => (
          <div
            key={d.date}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              borderRadius: "0.4rem",
              padding: "0.35rem 0.6rem",
              fontFamily: "var(--font-mono)",
              fontSize: "0.7rem",
              color: "var(--cream)",
            }}
          >
            <span style={{ color: "var(--cream-muted)", marginRight: "0.4rem" }}>{d.date}</span>
            <span style={{ color: "var(--amber-bright)", fontWeight: 700 }}>${d.price}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FlightResultCard({
  data,
  isLatest,
}: {
  data: StoredFlightResult;
  isLatest: boolean;
}) {
  const { args, flights } = data;
  const cheapestPrice = flights.length
    ? Math.min(...flights.map((f) => f.price))
    : null;

  return (
    <div
      style={{
        background: "rgba(7,8,10,0.82)",
        border: `1px solid ${isLatest ? "var(--amber)" : "var(--border)"}`,
        borderLeft: `2px solid ${isLatest ? "var(--amber)" : "transparent"}`,
        borderRadius: "0.75rem",
        padding: "1.1rem",
        opacity: isLatest ? 1 : 0.5,
      }}
    >
      <RouteHeader args={args} />
      {flights.length === 0 ? (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.7rem",
            color: "var(--cream-muted)",
            letterSpacing: "0.08em",
          }}
        >
          NO FLIGHTS FOUND
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {flights.slice(0, 5).map((flight, i) => (
            <FlightCard
              key={i}
              flight={flight}
              index={i}
              isCheapest={flight.price === cheapestPrice && i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ResultsCanvas({ state }: { state: AgentState }) {
  const entries = mergeAndSort(state);
  const arcs = deriveArcs(state);
  const latestTs = entries.length > 0 ? entries[0].data.ts : null;

  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden" }}>
      {/* Full-bleed globe */}
      <GlobeCanvas arcs={arcs} />

      {/* Overlay panel */}
      <div
        style={{
          position: "absolute",
          top: "2rem",
          right: "2rem",
          width: "380px",
          maxHeight: "calc(100vh - 4rem)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        {entries.map((entry) => {
          const isLatest = entry.data.ts === latestTs;
          return entry.kind === "flight" ? (
            <FlightResultCard
              key={entry.data.id}
              data={entry.data}
              isLatest={isLatest}
            />
          ) : (
            <DateCard
              key={entry.data.id}
              data={entry.data}
              isLatest={isLatest}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/lucas/Projects/doctor-adk
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/lucas/Projects/doctor-adk
git add src/components/results-canvas.tsx
git commit -m "feat: ResultsCanvas with globe and overlay panel"
```

---

## Task 6: Wire `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Replace `page.tsx` content**

```tsx
"use client";

import { useCoAgent } from "@copilotkit/react-core";
import { CopilotSidebar } from "@copilotkit/react-ui";
import { ResultsCanvas } from "@/components/results-canvas";
import type { AgentState } from "@/lib/types";

function PlaneSvg() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: "1.25rem", height: "1.25rem", color: "var(--amber)" }}
    >
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
    </svg>
  );
}

export default function Page() {
  const { state } = useCoAgent<AgentState>({
    name: "my_agent",
    initialState: {},
  });

  const hasResults = !!(
    state.flight_results?.length || state.date_results?.length
  );

  return (
    <main style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <CopilotSidebar
        disableSystemMessage={true}
        clickOutsideToClose={false}
        defaultOpen={true}
        labels={{
          title: "Weekend Trips",
          initial: "Where do you want to escape to this weekend?",
        }}
        suggestions={[
          {
            title: "Vegas this weekend",
            message: "Find flights from Seattle to Las Vegas this weekend",
          },
          {
            title: "SF getaway",
            message:
              "Cheapest weekend to fly from Seattle to San Francisco in the next 6 weeks?",
          },
          {
            title: "LA quick trip",
            message: "Direct flights from Seattle to Los Angeles next Saturday",
          },
          {
            title: "Denver escape",
            message: "Find flights from Seattle to Denver for a weekend in May",
          },
        ]}
      >
        {hasResults ? (
          <ResultsCanvas state={state} />
        ) : (
          <div
            style={{
              minHeight: "100vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "4rem 2rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                marginBottom: "1.25rem",
              }}
            >
              <PlaneSvg />
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "0.65rem",
                  letterSpacing: "0.25em",
                  color: "var(--amber)",
                  textTransform: "uppercase",
                }}
              >
                SEA WEEKEND TRIPS
              </span>
            </div>

            <h1
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 300,
                fontSize: "clamp(3.5rem, 10vw, 6rem)",
                lineHeight: 0.9,
                letterSpacing: "-0.01em",
                color: "var(--cream)",
                textAlign: "center",
                marginBottom: "1.5rem",
              }}
            >
              Escape
              <br />
              <em style={{ fontStyle: "italic", color: "var(--amber)" }}>
                this weekend.
              </em>
            </h1>

            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "0.7rem",
                color: "var(--cream-muted)",
                letterSpacing: "0.1em",
                textAlign: "center",
                maxWidth: "22rem",
                lineHeight: 1.8,
              }}
            >
              Weekend trip planner flying out of Seattle.
              Find cheap flights and the best travel dates.
            </p>

            <div
              style={{
                marginTop: "3rem",
                display: "flex",
                gap: "1.5rem",
                opacity: 0.35,
              }}
            >
              {["SEA", "SFO", "LAX", "LAS", "DEN", "ORD", "JFK"].map((code) => (
                <span
                  key={code}
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.7rem",
                    letterSpacing: "0.12em",
                    color: "var(--amber)",
                  }}
                >
                  {code}
                </span>
              ))}
            </div>
          </div>
        )}
      </CopilotSidebar>
    </main>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/lucas/Projects/doctor-adk
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Start dev server and smoke-test locally**

```bash
cd /Users/lucas/Projects/doctor-adk
npm run dev
```

1. Open `http://localhost:3000` — hero should appear
2. Start the agent: `cd agent && uv run uvicorn main:app --host 0.0.0.0 --port 8000`
3. Ask: "Find flights from Seattle to Las Vegas this weekend"
4. After the run completes, the hero should swap to the globe + result card in the overlay panel
5. Ask a second question: "What about San Francisco?"
6. After run completes, a second card should appear (dimmed) and a new arc should be drawn to SFO

- [ ] **Step 4: Commit**

```bash
cd /Users/lucas/Projects/doctor-adk
git add src/app/page.tsx
git commit -m "feat: wire useCoAgent, ResultsCanvas replaces useRenderToolCall"
```

---

## Task 7: Deploy

**Files:** none (deployment only)

- [ ] **Step 1: Push to GitHub (triggers Vercel auto-deploy)**

```bash
cd /Users/lucas/Projects/doctor-adk
git push origin main
```

Vercel will auto-deploy the Next.js app. Monitor at the Vercel dashboard.

- [ ] **Step 2: Deploy Railway agent**

```bash
cd /Users/lucas/Projects/doctor-adk
railway up --detach
```

Wait for the build to complete (check the build log URL printed by the CLI).

- [ ] **Step 3: Verify production**

```bash
curl -s https://doctor-adk-agent-production.up.railway.app/health
```

Expected: `{"status":"ok"}`

Then open `https://doctor-adk.vercel.app` and run a full flight search to confirm globe + overlay panel work end-to-end in production.
