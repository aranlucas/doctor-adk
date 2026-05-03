"use client";

import { getToolCategory } from "@/lib/trvl-tools";

type Detail = { label: string; value: string };

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function firstArray(data: Record<string, any>, keys: string[]): any[] {
  for (const key of keys) {
    if (Array.isArray(data[key])) return data[key];
    if (Array.isArray(data.result?.[key])) return data.result[key];
  }
  if (Array.isArray(data.result)) return data.result;
  return [];
}

function money(value: any): string | null {
  if (!isRecord(value)) return null;
  const price = value.price ?? value.total_price ?? value.total_cost ?? value.amount;
  if (typeof price !== "number") return null;
  return `${price.toLocaleString()} ${value.currency ?? "USD"}`;
}

function text(value: unknown, fallback = "—"): string {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "number") return value.toLocaleString();
  return String(value);
}

function details(items: Detail[]) {
  const visible = items.filter((item) => item.value && item.value !== "—").slice(0, 6);
  if (!visible.length) return null;
  return (
    <div className="tool-detail-grid">
      {visible.map((item) => (
        <div key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

function MiniList({
  items,
  render,
  empty,
}: {
  items: any[];
  render: (item: any, index: number) => React.ReactNode;
  empty: string;
}) {
  if (!items.length) return <p className="tool-empty">{empty}</p>;
  return <div className="tool-mini-list">{items.slice(0, 5).map(render)}</div>;
}

function FlightRows({ flights }: { flights: any[] }) {
  return (
    <MiniList
      items={flights}
      empty="No flight options returned."
      render={(flight, index) => {
        const leg = asArray(flight.legs)[0] ?? {};
        const lastLeg = asArray(flight.legs).at(-1) ?? leg;
        return (
          <div className="flight-strip" key={index}>
            <div>
              <span>{text(leg.airline ?? flight.airline, "Flight")}</span>
              <strong>
                {text(leg.departure_airport ?? flight.origin)} →{" "}
                {text(lastLeg.arrival_airport ?? flight.destination)}
              </strong>
            </div>
            <div>
              <span>{flight.stops ?? asArray(flight.legs).length - 1} stops</span>
              <strong>{money(flight) ?? text(flight.duration)}</strong>
            </div>
          </div>
        );
      }}
    />
  );
}

function HotelRows({ hotels }: { hotels: any[] }) {
  return (
    <MiniList
      items={hotels}
      empty="No stays returned."
      render={(hotel, index) => (
        <div className="ranked-row" key={index}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>{text(hotel.name ?? hotel.hotel_name, "Hotel")}</strong>
            <small>
              {hotel.stars ? `${hotel.stars} stars` : ""}
              {hotel.rating ? `${hotel.stars ? " · " : ""}${hotel.rating} rating` : ""}
            </small>
          </div>
          <b>{money(hotel) ?? text(hotel.price_text)}</b>
        </div>
      )}
    />
  );
}

function RouteRows({ routes }: { routes: any[] }) {
  return (
    <MiniList
      items={routes}
      empty="No routes returned."
      render={(route, index) => (
        <div className="route-row" key={index}>
          <div>
            <strong>
              {text(route.mode ?? route.type ?? route.provider, "Route")}
              {route.transfers !== undefined ? ` · ${route.transfers} transfers` : ""}
            </strong>
            <small>{text(route.duration ?? route.duration_text ?? route.summary)}</small>
          </div>
          <b>{money(route) ?? text(route.price_text)}</b>
        </div>
      )}
    />
  );
}

function WeatherTimeline({ days }: { days: any[] }) {
  return (
    <MiniList
      items={days}
      empty="No forecast returned."
      render={(day, index) => (
        <div className="weather-day" key={index}>
          <span>{text(day.date ?? day.day)}</span>
          <strong>
            {text(day.high ?? day.temperature_max ?? day.max_temp ?? day.temp_max)}
            {day.low ?? day.temperature_min ?? day.min_temp ?? day.temp_min
              ? ` / ${text(day.low ?? day.temperature_min ?? day.min_temp ?? day.temp_min)}`
              : ""}
          </strong>
          <small>{text(day.condition ?? day.conditions ?? day.description ?? day.summary)}</small>
        </div>
      )}
    />
  );
}

function CheckRows({ checks }: { checks: any[] }) {
  return (
    <MiniList
      items={checks}
      empty="No checks returned."
      render={(check, index) => (
        <div className="check-row" key={index}>
          <i data-status={text(check.status).toLowerCase()} />
          <div>
            <strong>{text(check.dimension ?? check.name ?? check.status)}</strong>
            <small>{text(check.summary ?? check.notes ?? check.reason)}</small>
          </div>
        </div>
      )}
    />
  );
}

function EventRows({ events }: { events: any[] }) {
  return (
    <MiniList
      items={events}
      empty="No events returned."
      render={(event, index) => (
        <div className="event-row" key={index}>
          <span>{text(event.date ?? event.start_date ?? event.start)}</span>
          <div>
            <strong>{text(event.name ?? event.title, "Event")}</strong>
            <small>{text(event.venue ?? event.location ?? event.category)}</small>
          </div>
        </div>
      )}
    />
  );
}

export function DetailedToolResult({
  name,
  result,
}: {
  name: string;
  result: unknown;
}) {
  const data = normalizeResult(result);
  if (typeof data.error === "string") {
    return <div className="tool-error">{data.error}</div>;
  }

  if (["search_flights", "find_interactive", "plan_flight_bundle", "search_hidden_city", "search_awards"].includes(name)) {
    return (
      <>
        {details([
          { label: "Route", value: data.origin && data.destination ? `${data.origin} → ${data.destination}` : "" },
          { label: "Best", value: money(firstArray(data, ["flights", "bundles", "offers", "awards"])[0]) ?? "" },
          { label: "Suggestions", value: text(asArray(data.suggestions).length || "") },
        ])}
        <FlightRows flights={firstArray(data, ["flights", "bundles", "offers", "awards"])} />
      </>
    );
  }

  if (["search_route", "search_ground", "search_airport_transfers"].includes(name)) {
    return <RouteRows routes={firstArray(data, ["itineraries", "routes", "transfers"])} />;
  }

  if (["get_baggage_rules", "search_lounges"].includes(name)) {
    return (
      <>
        {details([
          { label: "Airport", value: text(data.airport ?? data.airport_code, "") },
          { label: "Airline", value: text(data.airline ?? data.airline_code, "") },
        ])}
        <RouteRows routes={firstArray(data, ["rules", "lounges"])} />
      </>
    );
  }

  if (["search_hotels", "search_hotel_by_name", "hotel_rooms", "hotel_prices", "detect_accommodation_hacks"].includes(name)) {
    return (
      <>
        {details([
          { label: "Location", value: text(data.location ?? data.city, "") },
          { label: "Best", value: money(firstArray(data, ["hotels", "rooms", "prices", "hacks"])[0]) ?? "" },
        ])}
        <HotelRows hotels={firstArray(data, ["hotels", "rooms", "prices", "hacks"])} />
      </>
    );
  }

  if (name === "hotel_reviews") {
    return (
      <>
        {details([
          { label: "Rating", value: text(data.rating ?? data.average_rating, "") },
          { label: "Reviews", value: text(asArray(data.reviews).length || data.review_count || "") },
          { label: "Summary", value: text(data.summary, "") },
        ])}
        <EventRows events={asArray(data.reviews)} />
      </>
    );
  }

  if (["get_weather"].includes(name)) {
    return <WeatherTimeline days={firstArray(data, ["forecasts", "forecast", "daily", "days"])} />;
  }

  if (["local_events", "nearby_places", "search_restaurants", "search_deals"].includes(name)) {
    return <EventRows events={firstArray(data, ["events", "places", "restaurants", "deals"])} />;
  }

  if (["destination_info", "travel_guide", "weekend_getaway", "suggest_dates", "search_dates", "plan_trip"].includes(name)) {
    return (
      <>
        {details([
          { label: "Location", value: text(data.location ?? data.destination ?? data.city, "") },
          { label: "Country", value: text(data.country, "") },
          { label: "Currency", value: text(data.currency, "") },
          { label: "Timezone", value: text(data.timezone, "") },
          { label: "Total", value: money(data.summary ?? data.result ?? data) ?? "" },
        ])}
        <FlightRows flights={firstArray(data, ["outbound_flights", "candidates", "dates", "destinations"])} />
        <HotelRows hotels={firstArray(data, ["hotels"])} />
      </>
    );
  }

  if (["assess_trip", "calculate_trip_cost", "check_visa", "calculate_points_value", "detect_travel_hacks", "optimize_booking", "optimize_trip_dates", "find_trip_window", "optimize_multi_city"].includes(name)) {
    return (
      <>
        {details([
          { label: "Verdict", value: text(data.verdict ?? data.recommendation ?? data.requirement, "") },
          { label: "Cost", value: money(data.result ?? data) ?? "" },
          { label: "CPP", value: text(data.cents_per_point ?? data.cpp, "") },
          { label: "Stay", value: text(data.max_stay ?? data.nights, "") },
        ])}
        <CheckRows checks={firstArray(data, ["checks", "hacks", "candidates", "strategies", "segments"])} />
      </>
    );
  }

  if (["create_trip", "list_trips", "get_trip", "update_trip", "mark_trip_booked", "export_ics", "watch_price", "list_watches", "check_watches", "watch_opportunities", "list_opportunity_watches", "watch_room_availability"].includes(name)) {
    return (
      <>
        {details([
          { label: "Trip", value: text(data.name ?? data.trip_name ?? data.id ?? data.trip_id, "") },
          { label: "Status", value: text(data.status, "") },
          { label: "Events", value: text(data.event_count, "") },
          { label: "Target", value: text(data.target_price, "") },
        ])}
        <EventRows events={firstArray(data, ["trips", "watches", "events", "legs", "bookings"])} />
      </>
    );
  }

  if (["get_preferences", "update_preferences", "build_profile", "add_booking", "onboard_profile", "interview_trip"].includes(name)) {
    return (
      <>
        {details(Object.entries(data).map(([key, value]) => ({ label: key.replaceAll("_", " "), value: Array.isArray(value) ? value.join(", ") : text(value, "") })))}
      </>
    );
  }

  if (["suggest_providers", "list_providers", "configure_provider", "test_provider", "provider_health", "remove_provider", "test_tool_with_progress"].includes(name)) {
    return (
      <>
        {details([
          { label: "Provider", value: text(data.id ?? data.name ?? data.provider, "") },
          { label: "Status", value: text(data.status ?? data.success, "") },
          { label: "Category", value: text(data.category, "") },
          { label: "Errors", value: text(data.error_count ?? data.errors, "") },
        ])}
        <RouteRows routes={firstArray(data, ["providers", "diagnostics", "health", "catalog"])} />
      </>
    );
  }

  return (
    <>
      <div className="tool-kicker">{getToolCategory(name)} result</div>
      {details(Object.entries(data).map(([key, value]) => ({ label: key.replaceAll("_", " "), value: Array.isArray(value) ? `${value.length} items` : text(value, "") })))}
    </>
  );
}

function normalizeResult(result: unknown): Record<string, any> {
  if (typeof result === "string") {
    try {
      return normalizeResult(JSON.parse(result));
    } catch {
      return { text: result };
    }
  }
  if (!isRecord(result)) return {};
  if (isRecord(result.structuredContent)) return normalizeResult(result.structuredContent);
  if (isRecord(result.result)) return { ...result, ...result.result };
  if (Array.isArray(result.content) && typeof result.content[0]?.text === "string") {
    try {
      return normalizeResult(JSON.parse(result.content[0].text));
    } catch {
      return result;
    }
  }
  return result;
}
