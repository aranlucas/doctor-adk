"use client";

import * as React from "react";
import { useAgent, UseAgentUpdate } from "@copilotkit/react-core/v2";
import { CATEGORY_META, getToolCategory } from "@/lib/trvl-tools";
import type { AgentState } from "@/lib/types";
import { DetailedToolResult } from "./tool-result-components";

interface ToolCallProps {
  status: "complete" | "inProgress" | "executing";
  name?: string;
  args?: any;
  result?: any;
}

export default function McpToolCall({
  status,
  name = "",
  args,
  result,
}: ToolCallProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { agent } = useAgent({
    agentId: "my_agent",
    updates: [UseAgentUpdate.OnStateChanged],
  });
  const state = (agent?.state ?? {}) as AgentState;
  const category = getToolCategory(name);
  const meta = CATEGORY_META[category];

  const format = (content: any): string => {
    if (!content) return "";
    const text =
      typeof content === "object"
        ? JSON.stringify(content, null, 2)
        : String(content);
    return text
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
  };

  const statusColor =
    status === "complete"
      ? "bg-green-400"
      : status === "inProgress" || status === "executing"
        ? "bg-amber-400 animate-pulse"
        : "bg-gray-500";

  const resultObject =
    result && typeof result === "object" && !Array.isArray(result)
      ? result
      : undefined;
  const contentResult = Array.isArray(resultObject?.content)
    ? resultObject?.content?.[0]?.text
    : undefined;
  const parsedContent = React.useMemo(() => {
    const source = typeof contentResult === "string" ? contentResult : typeof result === "string" ? result : undefined;
    if (typeof source !== "string") return undefined;
    try {
      return JSON.parse(source);
    } catch {
      return undefined;
    }
  }, [contentResult, result]);
  const stateResult = findStateResult(state, name);
  const visibleResult = unwrapResult(stateResult ?? resultObject?.structuredContent ?? parsedContent ?? result);

  const summary = summarizeToolResult(name, visibleResult);

  return (
    <div
      className="tool-call-card"
      style={
        {
          fontFamily: "var(--font-mono)",
          "--tool-accent": meta.accent,
          "--tool-soft": meta.soft,
        } as React.CSSProperties
      }
    >
      <div
        className="tool-call-main"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="tool-call-title">
          <span>{meta.label}</span>
          <strong>{name ? name.replaceAll("_", " ") : "MCP Tool Call"}</strong>
        </div>
        <div className="tool-call-status">
          <span>{status === "complete" ? "complete" : "running"}</span>
          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
        </div>
      </div>

      {summary.length > 0 && (
        <div className="tool-call-summary">
          {summary.map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="tool-call-details">
        <DetailedToolResult name={name} result={visibleResult} />
      </div>

      {isOpen && (
        <div className="px-4 pb-4 text-amber-100/80 text-xs font-mono">
          {args && (
            <div className="mb-4">
              <div className="text-amber-400/60 mb-2 text-xs uppercase tracking-wider">
                Parameters
              </div>
              <pre className="whitespace-pre-wrap max-h-[200px] overflow-auto bg-black/30 p-2 rounded">
                {format(args)}
              </pre>
            </div>
          )}

          {status === "complete" && result && (
            <div>
              <div className="text-amber-400/60 mb-2 text-xs uppercase tracking-wider">
                Result
              </div>
              <pre className="whitespace-pre-wrap max-h-[200px] overflow-auto bg-black/30 p-2 rounded">
                {format(visibleResult)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function findStateResult(state: AgentState, toolName: string): unknown {
  if (!toolName) return undefined;
  if (state[toolName] !== undefined) return state[toolName];
  const suffixMatch = Object.entries(state).find(([key]) =>
    key === toolName || key.endsWith(`.${toolName}`) || key.endsWith(`/${toolName}`),
  );
  return suffixMatch?.[1];
}

function unwrapResult(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const data = value as Record<string, any>;
  if (data.structuredContent) return data.structuredContent;
  if (data.result && typeof data.result === "object") return data.result;
  if (Array.isArray(data.content) && typeof data.content[0]?.text === "string") {
    try {
      return JSON.parse(data.content[0].text);
    } catch {
      return value;
    }
  }
  return value;
}

function asRecord(value: unknown): Record<string, any> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, any>)
    : undefined;
}

function money(value: any): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const price = value.price ?? value.total_price ?? value.total_cost;
  if (typeof price !== "number") return undefined;
  return `${price.toLocaleString()} ${value.currency ?? "USD"}`;
}

function summarizeToolResult(
  toolName: string,
  result: unknown,
): Array<{ label: string; value: string }> {
  const data = asRecord(result);
  if (!data) return [];
  if (typeof data.error === "string") return [{ label: "Error", value: data.error }];

  const items: Array<{ label: string; value: string }> = [];
  const pushCount = (label: string, key: string) => {
    if (Array.isArray(data[key])) items.push({ label, value: String(data[key].length) });
  };

  pushCount("Flights", "flights");
  pushCount("Hotels", "hotels");
  pushCount("Routes", "itineraries");
  pushCount("Deals", "deals");
  pushCount("Events", "events");
  pushCount("Forecasts", "forecasts");
  pushCount("Restaurants", "restaurants");
  pushCount("Trips", "trips");
  pushCount("Watches", "watches");

  if (typeof data.verdict === "string") {
    items.push({ label: "Verdict", value: data.verdict });
  }

  const topPrice =
    money(data) ??
    money(data.flights?.[0]) ??
    money(data.hotels?.[0]) ??
    money(data.itineraries?.[0]) ??
    money(data.result?.candidates?.[0]);
  if (topPrice) items.push({ label: "Best", value: topPrice });

  if (typeof data.origin === "string" && typeof data.destination === "string") {
    items.push({ label: "Route", value: `${data.origin} → ${data.destination}` });
  }

  if (toolName === "check_visa" && typeof data.requirement === "string") {
    items.push({ label: "Entry", value: data.requirement });
  }

  return items.slice(0, 4);
}
