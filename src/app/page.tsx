"use client";

import { CopilotChat } from "@copilotkit/react-core/v2";
import { ToolRenderer } from "@/components/tool-renderer";
import { TripGlobeView } from "@/components/trip-globe-view";
import { TravelStatePanel } from "@/components/travel-state-panel";

export default function Page() {
  return (
    <main className="travel-console">
      <section className="travel-stage">
        <TripGlobeView />
        <div className="travel-stage-overlay">
          <div className="travel-brand">
            <span>TRVL MCP</span>
            <h1>Concierge Control</h1>
          </div>
          <TravelStatePanel />
        </div>
      </section>
      <div className="chat-shell">
        <CopilotChat className="chat-panel" />
      </div>
      <ToolRenderer />
    </main>
  );
}
