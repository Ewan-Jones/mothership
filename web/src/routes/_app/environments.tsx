import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const EnvironmentsPage = lazy(() =>
  import("../../pages/EnvironmentsPage").then((m) => ({ default: m.EnvironmentsPage })),
);

export const Route = createFileRoute("/_app/environments")({
  component: EnvironmentsRoute,
});

function EnvironmentsRoute() {
  const navigate = useNavigate();
  const handleNavigateToSession = (sessionId: string, options?: { cwd?: string; agentId?: string }) => {
    const search: Record<string, string> = {};
    if (options?.cwd) search.cwd = options.cwd;
    if (options?.agentId) search.agentId = options.agentId;
    void navigate({ to: "/$sessionId", params: { sessionId }, search });
  };
  return (
    <Suspense>
      <EnvironmentsPage onNavigateToSession={handleNavigateToSession} />
    </Suspense>
  );
}
