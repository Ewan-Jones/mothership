import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const ApiKeyManager = lazy(() => import("../../pages/ApiKeyManager").then((m) => ({ default: m.ApiKeyManager })));

export const Route = createFileRoute("/_app/apikeys")({
  component: ApiKeysRoute,
});

function ApiKeysRoute() {
  const navigate = useNavigate();
  return (
    <Suspense>
      <ApiKeyManager onBack={() => void navigate({ to: "/" })} />
    </Suspense>
  );
}
