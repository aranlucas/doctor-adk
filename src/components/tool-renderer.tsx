"use client";

import { useRenderTool } from "@copilotkit/react-core/v2";
import type { StandardSchemaV1 } from "@copilotkit/shared";
import McpToolCall from "./mcp-tool-call";
import { TRVL_TOOL_NAMES } from "@/lib/trvl-tools";

const looseParametersSchema: StandardSchemaV1<Record<string, unknown>> & {
  "~standard": StandardSchemaV1["~standard"] & {
    jsonSchema: {
      input: () => Record<string, unknown>;
    };
  };
} = {
  "~standard": {
    version: 1,
    vendor: "doctor-adk",
    validate: (value: unknown) => ({
      value:
        typeof value === "object" && value !== null
          ? (value as Record<string, unknown>)
          : {},
    }),
    jsonSchema: {
      input: () => ({
        type: "object",
        properties: {},
        additionalProperties: true,
      }),
    },
  },
};

function TrvlToolRenderer({ name }: { name: string }) {
  useRenderTool(
    {
      name,
      parameters: looseParametersSchema,
      render: ({ status, result }) => (
        <McpToolCall
          status={status}
          name={name}
          result={result}
        />
      ),
    },
    [name],
  );

  return null;
}

export function ToolRenderer() {
  return (
    <>
      {TRVL_TOOL_NAMES.map((name) => (
        <TrvlToolRenderer key={name} name={name} />
      ))}
    </>
  );
}
