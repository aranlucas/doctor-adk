"use client";

import { useMemo } from "react";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";
import type { AgentState } from "@/lib/types";
import { CATEGORY_META, getToolCategory, isKnownTrvlTool } from "@/lib/trvl-tools";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function countItems(value: unknown): string {
  if (Array.isArray(value)) return `${value.length} rows`;
  if (!isRecord(value)) return typeof value;
  for (const key of [
    "flights",
    "hotels",
    "itineraries",
    "routes",
    "deals",
    "events",
    "restaurants",
    "watches",
    "trips",
    "checks",
  ]) {
    const child = value[key];
    if (Array.isArray(child)) return `${child.length} ${key}`;
  }
  return `${Object.keys(value).length} fields`;
}

function headline(value: unknown): string {
  if (!isRecord(value)) return String(value);
  if (typeof value.error === "string") return value.error;
  if (typeof value.verdict === "string") return `Verdict: ${value.verdict}`;
  if (typeof value.destination === "string" && typeof value.origin === "string") {
    return `${value.origin} to ${value.destination}`;
  }
  if (typeof value.location === "string") return value.location;
  if (typeof value.name === "string") return value.name;
  if (typeof value.summary === "string") return value.summary;
  return countItems(value);
}

export function TravelStatePanel() {
  const { agent } = useAgent({
    agentId: "my_agent",
    updates: [UseAgentUpdate.OnStateChanged],
  });
  const state = (agent?.state ?? {}) as AgentState;

  const toolStates = useMemo(
    () =>
      Object.entries(state)
        .filter(([key]) => key !== "active_trip" && isKnownTrvlTool(key))
        .sort(([a], [b]) => a.localeCompare(b)),
    [state],
  );

  return (
    <section className="travel-state-panel" aria-label="Travel tool state">
      <div className="state-panel-header">
        <span>Context State</span>
        <strong>{toolStates.length}</strong>
      </div>
      <div className="state-panel-grid">
        {toolStates.length === 0 ? (
          <div className="state-empty">
            <span>No structured tool state yet</span>
            <small>Run a TRVL tool and its removed structured content lands here.</small>
          </div>
        ) : (
          toolStates.map(([tool, value]) => {
            const category = getToolCategory(tool);
            const meta = CATEGORY_META[category];
            return (
              <article
                className="state-chip"
                key={tool}
                style={
                  {
                    "--tool-accent": meta.accent,
                    "--tool-soft": meta.soft,
                  } as React.CSSProperties
                }
              >
                <div>
                  <span>{meta.label}</span>
                  <strong>{tool.replaceAll("_", " ")}</strong>
                </div>
                <p>{headline(value)}</p>
                <small>{countItems(value)}</small>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
