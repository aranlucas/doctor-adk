"use client";

import { CopilotKit, createA2UIMessageRenderer } from "@copilotkit/react-core/v2";

const a2uiMessageRenderer = createA2UIMessageRenderer();

type CopilotProviderProps = {
  children: React.ReactNode;
};

export function CopilotProvider({ children }: CopilotProviderProps) {
  return (
    <CopilotKit
      runtimeUrl="/api/copilotkit"
      agent="my_agent"
      renderActivityMessages={[a2uiMessageRenderer]}
    >
      {children}
    </CopilotKit>
  );
}
