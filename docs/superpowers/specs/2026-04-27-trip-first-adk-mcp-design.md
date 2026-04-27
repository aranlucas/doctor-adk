# Trip-First ADK MCP Design

## Goal

Refactor the travel planner from a single flight-focused ADK agent into a trip-planning system that uses the same `trvl` MCP endpoint with filtered toolsets per specialized agent. The frontend should render from a canonical trip-first state object while retaining raw result histories for maps, cards, and debugging.

## Current Context

- `agent/main.py` already connects to `TRVL_MCP_URL` through `McpToolset`.
- The MCP server exposes 55 travel tools over streamable HTTP.
- The current agent prompt only focuses on `get_preferences`, `search_flights`, and `search_dates`.
- The frontend consumes ADK shared state through `useCoAgent` in `src/app/page.tsx`.
- Current shared state supports `flight_results` and `date_results`.

## Architecture

Use one MCP endpoint and create multiple filtered `McpToolset` instances through a helper:

```python
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

The root agent coordinates sub-agents:

- `travel_concierge_agent`: root router, date normalization, slot filling, final synthesis.
- `profile_agent`: preferences, onboarding, profile enrichment.
- `discovery_agent`: destination discovery, flexible dates, guides, weather, events.
- `transport_agent`: flights, route search, ground transport, baggage, lounges.
- `lodging_agent`: hotels, room options, reviews, hotel pricing, accommodation hacks.
- `viability_agent`: trip viability, visa, cost, points value, date and booking optimization.
- `itinerary_agent`: saved trips, trip legs, booking markers, ICS export, watches.

Each sub-agent receives only the MCP tools it needs. This limits prompt ambiguity and reduces accidental calls to sensitive mutation tools.

## State Contract

The frontend should primarily render `active_trip`:

```ts
type AgentState = {
  active_trip?: ActiveTrip;
  result_history?: ResultHistory;
  flight_results?: StoredFlightResult[];
  date_results?: StoredDateResult[];
  hotel_results?: StoredHotelResult[];
  route_results?: StoredRouteResult[];
  viability_results?: StoredViabilityResult[];
  [key: string]: unknown;
};
```

`active_trip` is the canonical summary:

```ts
type ActiveTrip = {
  id?: string;
  origin?: string;
  destination?: string;
  depart_date?: string;
  return_date?: string;
  guests?: number;
  currency?: string;
  profile?: {
    home_airports?: string[];
    preferences_loaded?: boolean;
  };
  transport?: {
    selected_flight?: Flight;
    options?: Flight[];
    routes?: RouteOption[];
  };
  lodging?: {
    selected_hotel?: HotelOption;
    options?: HotelOption[];
  };
  viability?: {
    verdict?: string;
    checks?: ViabilityCheck[];
    total_cost?: number;
  };
  guide?: {
    summary?: string;
    weather?: unknown;
    events?: unknown[];
  };
  watches?: PriceWatch[];
  updated_at: number;
};
```

Raw result arrays remain available so existing flight/date cards and globe arcs continue to work during migration.

## Data Flow

1. User asks for a trip plan.
2. Root agent gets the current date and routes to relevant sub-agents.
3. Sub-agents call filtered MCP tools.
4. `after_tool_callback` normalizes selected MCP responses.
5. Callback updates both raw histories and `active_trip`.
6. Frontend selectors read `active_trip` first and fall back to raw histories.
7. `ResultsCanvas` renders trip sections for transport, lodging, viability, guide, and watches.

## Mutation Safety

Provider configuration tools are intentionally excluded from the initial agent split. If added later, they must live in a separate provider-admin agent with explicit user confirmation before `configure_provider` or `remove_provider`.

Trip mutation tools such as `create_trip`, `mark_trip_booked`, `watch_price`, and `watch_room_availability` should only run after clear user intent.

## Testing

Add focused coverage for:

- State selectors accepting both direct arrays and prefix-based state keys.
- Callback normalization for flights, dates, hotels, routes, and viability.
- Agent construction ensuring each sub-agent receives a filtered MCP tool list.

Frontend rendering tests are optional for the first pass unless the UI changes become large.

## Scope

In scope:

- Refactor ADK agent definitions.
- Add filtered MCP toolset helper.
- Add trip-first state types and selectors.
- Extend callback state normalization.
- Update the UI enough to display trip-first state.

Out of scope:

- New external provider configuration UI.
- Payment or booking execution.
- Persisting state outside ADK in-memory services.
