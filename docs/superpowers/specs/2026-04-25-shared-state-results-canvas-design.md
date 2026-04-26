# Shared State Results Canvas

**Date:** 2026-04-25
**Approach:** useCoAgent shared state (Approach A)

## Goal

Replace the current `useRenderToolCall` sidebar rendering with a main-area results canvas that accumulates flight and date search results in real-time via `ag_ui_adk` shared state. The sidebar remains for chat; the canvas grows as the user searches.

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

### `ResultsCanvas` (`src/components/results-canvas.tsx`)

Receives `AgentState`. Merges `flight_results` and `date_results` into a single list sorted by `ts` descending (newest first). The entry with the highest `ts` is the "latest".

Rendering per card:
- **Latest card**: full opacity, 2px amber left border, normal weight header
- **Older cards**: 50% opacity, no accent border

Each flight result card shows:
- Header: `SEA → {DEST}  •  {departure_date}` (or date range)
- List of up to 5 flights: airline, price, duration, stops
- If no direct flights, label the cheapest with stops

Each date result card shows:
- Header: `SEA → {DEST}  •  cheapest dates`
- List of date options with price

Layout: single scrollable column, `gap: 1.5rem`, same dark background as existing canvas. Cards use the existing glassmorphic card style from `flight-card.tsx`.

### Hero transition

The hero `<div>` inside `CopilotSidebar` is conditionally rendered only when `!state.flight_results?.length && !state.date_results?.length`. No animation needed — the state arrival itself causes the re-render.

## Scope

**In scope:**
- Accumulating results in session state via `after_tool_callback`
- `ResultsCanvas` rendering flight and date cards in main area
- Dimming older results
- Removing `useRenderToolCall` from sidebar

**Out of scope:**
- Clearing results (reset button, new session)
- Persisting results across page refresh (in-memory sessions only)
- Streaming partial results mid-tool-call (state updates only on run end via STATE_SNAPSHOT)
- Animations or transitions on card entry

## Files Changed

| File | Change |
|------|--------|
| `agent/main.py` | Add `after_tool_callback` function, pass to `LlmAgent` |
| `src/lib/types.ts` | Add `AgentState`, `StoredFlightResult`, `StoredDateResult` |
| `src/app/page.tsx` | Add `useCoAgent`, remove `useRenderToolCall`, render `<ResultsCanvas>` |
| `src/components/results-canvas.tsx` | New component |
