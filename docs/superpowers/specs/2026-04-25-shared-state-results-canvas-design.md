# Shared State Results Canvas + 3D Globe

**Date:** 2026-04-25
**Approach:** useCoAgent shared state (Approach A) + three-globe WebGL canvas

## Goal

Replace the current `useRenderToolCall` sidebar rendering with a main-area canvas featuring a full-bleed 3D globe (`three-globe`) that draws arcs for each searched flight path, plus a scrollable overlay panel of result cards. State flows from the ADK agent via `ag_ui_adk` shared state. The sidebar remains for chat.

## Architecture

```
fli-mcp tool result
  → after_tool_callback (Python, agent/main.py)
    → appends entry to tool_context.state["flight_results"] or ["date_results"]
      → STATE_SNAPSHOT emitted by ag_ui_adk at run end
        → useCoAgent({ name: "my_agent" }) on frontend reads updated state
          → ResultsCanvas renders accumulated cards in main area
```

No new infrastructure. `ag_ui_adk` already emits `STATE_SNAPSHOT` at the end of every run containing the full ADK session state. Custom keys written to `tool_context.state` are included automatically.

## Agent Side

### `after_tool_callback` in `agent/main.py`

Added to `LlmAgent(after_tool_callback=...)`. Runs after every tool call.

Logic:
1. Check `tool.name` — only act on `search_flights` or `search_dates`
2. Parse the JSON string from `tool_response` (fli-mcp returns `{"content": [{"text": "..."}]}`)
3. Build a result entry:
   ```python
   {
     "id": str(uuid4()),
     "args": args,          # the tool call arguments (origin, destination, dates, etc.)
     "flights": [...],      # parsed from tool response
     "ts": int(time.time())
   }
   ```
   For `search_dates`, `"dates"` instead of `"flights"`.
4. Read current list from `tool_context.state.get("flight_results", [])`, append, write back
5. Return `None` — does not modify the tool response seen by the LLM

Only successful results (where `success: true` in the fli response) are stored. Failed lookups are silently skipped.

## Frontend Side

### State Type (`src/lib/types.ts`)

```typescript
export interface StoredFlightResult {
  id: string;
  args: Record<string, string>;
  flights: Flight[];       // existing type from types.ts
  ts: number;
}

export interface StoredDateResult {
  id: string;
  args: Record<string, string>;
  dates: DatePrice[];      // existing type from types.ts
  ts: number;
}

export interface AgentState {
  flight_results?: StoredFlightResult[];
  date_results?: StoredDateResult[];
}
```

`Flight` and `DatePrice` are the existing types in `src/lib/types.ts`.

### `page.tsx`

- Add `useCoAgent<AgentState>({ name: "my_agent", initialState: {} })`
- Remove both `useRenderToolCall` calls
- Conditionally render: if state has any results → `<ResultsCanvas state={state} />`; otherwise → existing hero markup

### `GlobeCanvas` (`src/components/globe-canvas.tsx`)

Full-bleed WebGL globe using `three-globe`. Receives `arcs: ArcDatum[]` derived from agent state.

**Library:** `react-globe.gl` (React wrapper around `three-globe`; handles Three.js setup internally). The component is client-only (`"use client"`, dynamic import with `ssr: false` since it requires `window`).

**Airport coordinate table** (`src/lib/airports.ts`): static lookup of IATA code → `{ lat, lng }` for the airports referenced in the agent's suggestions: SEA, SFO, LAX, LAS, DEN, ORD, JFK, PDX, PHX, BOI, YVR, plus any destination seen in results that can be resolved. Unknown codes fall back gracefully (arc not drawn).

**Arc data shape:**
```typescript
interface ArcDatum {
  startLat: number; startLng: number;
  endLat: number;   endLng: number;
  color: string;    // amber (#F59E0B) for latest, muted white for older
  id: string;
}
```

**Globe appearance:**
- Dark globe texture (night-side Earth or stylized dark map via `three-globe`'s built-in textures)
- Background: same `var(--bg)` dark color as the rest of the UI
- Auto-rotates slowly (`0.1°/frame`) on Y axis; rotation pauses for 3s when new arcs arrive then resumes
- Arc altitude: `0.3` (gentle curve over the Pacific/continent)
- Latest arc: amber (`#F59E0B`), stroke width `1.5`, opacity `1.0`
- Older arcs: `rgba(255,255,255,0.25)`, stroke width `0.8`
- SEA origin dot: amber point always visible

**Sizing:** The globe container is `position: absolute; inset: 0` inside `ResultsCanvas`'s wrapper, which is `position: relative; width: 100%; height: 100vh`.

### `ResultsCanvas` (`src/components/results-canvas.tsx`)

Outer wrapper: `position: relative; width: 100%; height: 100vh; overflow: hidden`.

Contains:
1. `<GlobeCanvas arcs={arcs} />` — absolute fill layer behind
2. Overlay panel — `position: absolute; top: 2rem; right: 2rem; width: 380px; max-height: calc(100vh - 4rem); overflow-y: auto`

**Overlay panel** receives merged results sorted by `ts` descending:
- **Latest card**: full opacity, 2px amber left border
- **Older cards**: 50% opacity, no accent border

Each flight result card:
- Header: `SEA → {DEST}  •  {departure_date}`
- Up to 5 flights: airline, price, duration, stops

Each date result card:
- Header: `SEA → {DEST}  •  cheapest dates`
- Date options with price

Cards reuse the existing glassmorphic style from `flight-card.tsx`.

**Before any results:** `ResultsCanvas` is not mounted; the existing hero markup renders instead (no globe shown on initial load — keeps first impression clean).

### Hero transition

`page.tsx` renders the existing hero when `!hasResults`, otherwise renders `<ResultsCanvas>`. `hasResults = !!(state.flight_results?.length || state.date_results?.length)`. No animation — state arrival causes the swap.

## Scope

**In scope:**
- Accumulating results in session state via `after_tool_callback`
- `GlobeCanvas` with `react-globe.gl` — full-bleed, arcs per searched route
- `ResultsCanvas` overlay panel with flight/date cards, newest highlighted
- Dimming older results and arcs
- Removing `useRenderToolCall` from sidebar

**Out of scope:**
- Clearing results / reset button
- Persisting results across page refresh (in-memory sessions only)
- Streaming partial results mid-tool-call (state updates on run end via STATE_SNAPSHOT only)
- Click-to-zoom on globe arcs
- Airports not in the static lookup table (arcs silently skipped)

## Files Changed

| File | Change |
|------|--------|
| `agent/main.py` | Add `after_tool_callback`, pass to `LlmAgent` |
| `src/lib/types.ts` | Add `AgentState`, `StoredFlightResult`, `StoredDateResult`, `ArcDatum` |
| `src/lib/airports.ts` | New — static IATA → `{ lat, lng }` lookup table |
| `src/app/page.tsx` | Add `useCoAgent`, remove `useRenderToolCall`, render `<ResultsCanvas>` |
| `src/components/globe-canvas.tsx` | New — `react-globe.gl` wrapper, client-only |
| `src/components/results-canvas.tsx` | New — globe + overlay panel composition |
| `package.json` / lockfile | Add `react-globe.gl` dependency |
