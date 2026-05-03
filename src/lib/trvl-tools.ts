export type ToolCategory =
  | "profile"
  | "discovery"
  | "transport"
  | "lodging"
  | "viability"
  | "itinerary"
  | "provider"
  | "diagnostics"
  | "unknown";

const CATEGORY_TOOLS: Record<Exclude<ToolCategory, "unknown">, string[]> = {
  profile: [
    "get_preferences",
    "update_preferences",
    "build_profile",
    "add_booking",
    "onboard_profile",
    "interview_trip",
  ],
  discovery: [
    "weekend_getaway",
    "suggest_dates",
    "search_dates",
    "search_deals",
    "destination_info",
    "travel_guide",
    "get_weather",
    "local_events",
    "nearby_places",
    "search_natural",
    "plan_trip",
  ],
  transport: [
    "search_flights",
    "plan_flight_bundle",
    "find_interactive",
    "search_route",
    "search_ground",
    "search_airport_transfers",
    "get_baggage_rules",
    "search_lounges",
    "search_hidden_city",
    "search_awards",
  ],
  lodging: [
    "search_hotels",
    "search_hotel_by_name",
    "hotel_rooms",
    "hotel_prices",
    "hotel_reviews",
    "detect_accommodation_hacks",
    "watch_room_availability",
  ],
  viability: [
    "assess_trip",
    "calculate_trip_cost",
    "check_visa",
    "calculate_points_value",
    "detect_travel_hacks",
    "optimize_booking",
    "optimize_trip_dates",
    "find_trip_window",
    "optimize_multi_city",
    "search_restaurants",
  ],
  itinerary: [
    "create_trip",
    "list_trips",
    "get_trip",
    "update_trip",
    "mark_trip_booked",
    "export_ics",
    "watch_price",
    "list_watches",
    "check_watches",
    "watch_opportunities",
    "list_opportunity_watches",
  ],
  provider: [
    "suggest_providers",
    "list_providers",
    "configure_provider",
    "test_provider",
    "provider_health",
    "remove_provider",
  ],
  diagnostics: ["test_tool_with_progress"],
};

const TOOL_TO_CATEGORY = Object.entries(CATEGORY_TOOLS).reduce(
  (acc, [category, tools]) => {
    for (const tool of tools) acc[tool] = category as ToolCategory;
    return acc;
  },
  {} as Record<string, ToolCategory>,
);

export const TRVL_TOOL_NAMES = Object.values(CATEGORY_TOOLS).flat();

export const CATEGORY_META: Record<
  ToolCategory,
  { label: string; accent: string; soft: string }
> = {
  profile: { label: "Profile", accent: "#8bd3dd", soft: "rgba(139,211,221,0.13)" },
  discovery: { label: "Discovery", accent: "#f2cc8f", soft: "rgba(242,204,143,0.13)" },
  transport: { label: "Transport", accent: "#f4a261", soft: "rgba(244,162,97,0.13)" },
  lodging: { label: "Lodging", accent: "#cdb4db", soft: "rgba(205,180,219,0.13)" },
  viability: { label: "Viability", accent: "#81b29a", soft: "rgba(129,178,154,0.13)" },
  itinerary: { label: "Itinerary", accent: "#e07a5f", soft: "rgba(224,122,95,0.13)" },
  provider: { label: "Provider", accent: "#90be6d", soft: "rgba(144,190,109,0.13)" },
  diagnostics: { label: "Diagnostics", accent: "#b8c0ff", soft: "rgba(184,192,255,0.13)" },
  unknown: { label: "Tool", accent: "#d4a017", soft: "rgba(212,160,23,0.13)" },
};

export function getToolCategory(name?: string): ToolCategory {
  if (!name) return "unknown";
  return TOOL_TO_CATEGORY[name] ?? "unknown";
}

export function isKnownTrvlTool(name: string): boolean {
  return getToolCategory(name) !== "unknown";
}
