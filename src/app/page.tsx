"use client";

import { CopilotChat } from "@copilotkit/react-core/v2";
import { ToolRenderer } from "@/components/ToolRenderer";
import { CopilotProvider } from "@/components/CopilotProvider";

export default function Page() {
  return (
    <CopilotProvider>
      <main className="flex h-screen min-h-0 flex-col bg-[var(--bg)] p-5">
        <div className="a2ui-chat-container flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-amber-400/30">
        <CopilotChat
          instructions="You are a travel planning copilot."
          labels={{ title: "Weekend Trips" }}
          className="h-full min-h-0"
        />
      </div>
        <ToolRenderer />
      </main>
    </CopilotProvider>
  );
}
