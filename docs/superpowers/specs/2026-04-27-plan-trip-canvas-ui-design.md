# Plan Trip Canvas UI Design

**Date:** 2026-04-27
**Status:** Approved

## Goal

Display `plan_trip` tool results (outbound flights, return flights, hotels, cost summary) in the canvas right panel, and render a globe arc for trips that have origin/destination but no confirmed legs yet.

## Approach

Extend the existing right overlay panel in `ResultsCanvas` — below the existing `ActiveTripCard` — with flight and hotel sections driven by `AgentState` (no extra `useState` in `page.tsx`). The Python agent's `shared_after_tool_callback` already writes `plan_trip` results into `active_trip` state; we just need to expose the missing fields and render them.

## Data Flow

```
plan_trip tool call
  → shared_after_tool_callback (agent/utils.py)
    → active_trip.transport.options       (outbound flights)
    → active_trip.transport.return_options (return flights)  ← add this
    → active_trip.lodging.options          (hotels)
    → active_trip.summary                  (grand total etc.) ← add this
    → active_trip.nights                   ← add this
  → useCoAgent syncs to frontend
    → ResultsCanvas reads state.active_trip
      → renders PlanTripResults below ActiveTripCard
```

No `useState` lift in `page.tsx`. No `PlanTripCapture` side-effect component. Everything flows through existing `useCoAgent`.

## Components

### New: `src/components/plan-trip-results.tsx`

Three sub-components, all reading from `ActiveTrip`:

**`PlanSummaryBanner`**
- Route display: `SEA → MIA`
- Dates, nights
- Grand total (large, amber), per-day cost
- Flights subtotal + hotel subtotal as secondary line
- Amber border, dark card — matches `ActiveTripCard` visual language

**`PlanFlightSection`**
- Section header: `OUTBOUND · SEA → MIA` or `RETURN · MIA → SEA`
- Top 3 flights as simple row cards (NOT the boarding-pass `FlightCard` — plan_trip flights are flat with no legs array)
- Each row: price (amber, large), airline + flight number, stops badge, departure → arrival times, duration, route string
- Cheapest badge on the lowest-priced option

**`PlanHotelCard`**
- Hotel name, rating pill (color-coded), review count
- Price per night + total (e.g. `$38/night · $77 total`)
- Amenity chips from the amenities string
- Cheapest badge on lowest per-night

### Updated: `src/components/results-canvas.tsx`

**Globe fallback for trips without legs:**
- `getCoords(code)` helper: tries `AIRPORTS[code]` first (handles `SEA`, `MIA`), then falls back to existing `CITIES` fuzzy lookup (handles city name strings from legs)
- When `activeTrip` has no legs but has `origin` + `destination`: emit one fallback arc at `OPACITY_PENDING` (0.4), `strokeWidth: 0.8`, plus two endpoint points
- Existing leg-based arc logic unchanged when legs exist

**PlanTripResults rendering:**
- Rendered below `ActiveTripCard` in the right panel when `activeTrip.transport?.options` has items
- Uses the three sub-components above

## File Change List

| File | Change |
|------|--------|
| `agent/utils.py` | Store `summary` + `nights` into `active_trip` for `plan_trip` |
| `src/lib/types.ts` | Add `return_options`, `summary`, `nights` to `ActiveTrip` |
| `src/components/results-canvas.tsx` | Fallback arc; `getCoords` helper; render `PlanTripResults` |
| `src/components/plan-trip-results.tsx` | New file: `PlanSummaryBanner`, `PlanFlightSection`, `PlanHotelCard` |

## Design Constraints

- All styling uses existing CSS vars (`--amber`, `--cream`, `--bg-card`, etc.) and Space Mono font
- No new dependencies
- Right panel stays 380px wide, scrollable
- `ActiveTripCard` remains at top — plan trip results appear below it
