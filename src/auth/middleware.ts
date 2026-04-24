import type { Context, Next } from "hono";
import { auth } from "./better-auth";
import { validateApiKeyAndGetUser } from "./api-key-service";

/** Extract token from Authorization header or ?token= query param */
function extractToken(c: Context): string | undefined {
  const authHeader = c.req.header("Authorization");
  const queryToken = c.req.query("token");
  return authHeader?.replace("Bearer ", "") || queryToken;
}

/**
 * Session-based auth for Web UI routes.
 * Reads better-auth session from cookies/headers and injects user into context.
 */
export async function sessionAuth(c: Context, next: Next) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    return c.json({ error: { type: "unauthorized", message: "Not authenticated" } }, 401);
  }

  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  c.set("session", {
    id: session.session.id,
    userId: session.session.userId,
    token: session.session.token,
  });

  await next();
}

/**
 * API Key auth for ACP agent routes.
 * Validates the API key from ?token= or Authorization header, then injects user into context.
 */
export async function apiKeyAuth(c: Context, next: Next) {
  const token = extractToken(c);
  if (!token) {
    return c.json({ error: { type: "unauthorized", message: "Missing API key" } }, 401);
  }

  const result = await validateApiKeyAndGetUser(token);
  if (!result) {
    return c.json({ error: { type: "unauthorized", message: "Invalid API key" } }, 401);
  }

  // Look up user info from better-auth
  const user = await auth.api.getUser({ userId: result.userId });
  if (!user) {
    return c.json({ error: { type: "unauthorized", message: "User not found" } }, 401);
  }

  c.set("user", {
    id: user.user.id,
    email: user.user.email,
    name: user.user.name,
  });

  await next();
}
