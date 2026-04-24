import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: "", // same origin
});

export const { useSession, signIn, signUp, signOut } = authClient;
