import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const LoginPage = lazy(() => import("../pages/LoginPage").then((m) => ({ default: m.LoginPage })));

export const Route = createFileRoute("/login")({
  component: LoginRoute,
});

function LoginRoute() {
  const navigate = useNavigate();
  return (
    <Suspense>
      <LoginPage onLogin={() => void navigate({ to: "/" })} />
    </Suspense>
  );
}
