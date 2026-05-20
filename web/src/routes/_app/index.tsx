import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const Dashboard = lazy(() => import("../../pages/Dashboard").then((m) => ({ default: m.Dashboard })));

export const Route = createFileRoute("/_app/")({
  component: () => (
    <Suspense>
      <Dashboard />
    </Suspense>
  ),
});
