import { useState, useEffect, useCallback, lazy, Suspense, useMemo } from "react";
import { AppShell, type SidebarItem } from "./components/shell";
import { ThemeProvider } from "./lib/theme";
import { authClient, useSession } from "./lib/auth-client";
import { LoginPage } from "./pages/LoginPage";
import { ApiKeyManager } from "./pages/ApiKeyManager";
import {
  LayoutDashboard,
  MessageSquare,
  KeyRound,
  LogOut,
} from "lucide-react";

const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const SessionDetail = lazy(() => import("./pages/SessionDetail").then((m) => ({ default: m.SessionDetail })));

type ViewId = "dashboard" | "session" | "apikeys" | "login";

export default function App() {
  const { data: session, isPending } = useSession();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showApiKeys, setShowApiKeys] = useState(false);

  // Simple hash-based router
  const parseRoute = useCallback(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/code\/([^/]+)/);
    if (match && match[1] && match[1] !== "login" && match[1] !== "api-keys") {
      setCurrentSessionId(match[1]);
    } else {
      setCurrentSessionId(null);
    }
  }, []);

  useEffect(() => {
    parseRoute();
    window.addEventListener("popstate", parseRoute);
    return () => window.removeEventListener("popstate", parseRoute);
  }, [parseRoute]);

  const navigateToSession = useCallback((sessionId: string) => {
    window.history.pushState(null, "", `/code/${sessionId}`);
    setCurrentSessionId(sessionId);
  }, []);

  const navigateToDashboard = useCallback(() => {
    window.history.pushState(null, "", "/code/");
    setCurrentSessionId(null);
    setShowApiKeys(false);
  }, []);

  const navigateToApiKeys = useCallback(() => {
    setShowApiKeys(true);
    setCurrentSessionId(null);
  }, []);

  const handleLogout = useCallback(async () => {
    await authClient.signOut();
    window.location.reload();
  }, []);

  // Loading session state
  if (isPending) {
    return (
      <div className="flex h-screen items-center justify-center text-text-muted">
        Loading...
      </div>
    );
  }

  // Not authenticated — show login page
  if (!session) {
    return (
      <ThemeProvider defaultTheme="system">
        <LoginPage onLogin={() => window.location.reload()} />
      </ThemeProvider>
    );
  }

  const userEmail = session.user.email;
  const activeView: ViewId =
    showApiKeys ? "apikeys" :
    currentSessionId ? "session" : "dashboard";

  const navItems: SidebarItem[] = useMemo(() => [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <LayoutDashboard className="h-4 w-4" />,
      active: activeView === "dashboard",
      onClick: navigateToDashboard,
    },
    ...(currentSessionId && !showApiKeys ? [{
      id: "session",
      label: "Session",
      icon: <MessageSquare className="h-4 w-4" />,
      active: true,
      badge: "ACP",
      onClick: () => {},
    }] : []),
  ], [activeView, currentSessionId, navigateToDashboard]);

  const footerItems: SidebarItem[] = useMemo(() => [
    {
      id: "apikeys",
      label: "API Keys",
      icon: <KeyRound className="h-4 w-4" />,
      active: activeView === "apikeys",
      onClick: navigateToApiKeys,
    },
    {
      id: "logout",
      label: userEmail,
      icon: <LogOut className="h-4 w-4" />,
      onClick: handleLogout,
    },
  ], [activeView, userEmail, navigateToApiKeys, handleLogout]);

  const pageTitle = useMemo(() => {
    if (showApiKeys) return "API Keys";
    if (currentSessionId) return "Session";
    return "Dashboard";
  }, [showApiKeys, currentSessionId]);

  return (
    <ThemeProvider defaultTheme="system">
      <AppShell
        activeView={activeView}
        navItems={navItems}
        footerItems={footerItems}
        title={pageTitle}
      >
        <Suspense fallback={
          <div className="flex h-full items-center justify-center text-text-muted">Loading...</div>
        }>
          {showApiKeys ? (
            <ApiKeyManager onBack={navigateToDashboard} />
          ) : currentSessionId ? (
            <SessionDetail key={currentSessionId} sessionId={currentSessionId} />
          ) : (
            <Dashboard onNavigateSession={navigateToSession} />
          )}
        </Suspense>
      </AppShell>
    </ThemeProvider>
  );
}
