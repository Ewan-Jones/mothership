import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const AgentAppShell = lazy(() =>
  import("../../pages/agent-panel/AgentAppShell").then((m) => ({ default: m.AgentAppShell })),
);

export const Route = createFileRoute("/agent/$agentId_/$sessionId")({
  component: AgentWithSessionRoute,
});

function AgentWithSessionRoute() {
  const { agentId, sessionId } = Route.useParams();
  return (
    <Suspense
      fallback={
        <div className="flex h-screen flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          <p className="text-sm text-text-muted">加载智能体面板...</p>
        </div>
      }
    >
      <AgentAppShell agentId={agentId} sessionId={sessionId} />
    </Suspense>
  );
}
