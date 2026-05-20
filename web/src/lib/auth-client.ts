import { createAuthClient } from "better-auth/react";
import { organizationClient, apiKeyClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: "", // same origin
  plugins: [organizationClient(), apiKeyClient()],
});

export const { useSession, signIn, signUp, signOut } = authClient;
