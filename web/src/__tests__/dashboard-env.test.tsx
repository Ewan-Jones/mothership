import { describe, test, expect } from "bun:test";

// Type imports
import type { Environment, EnvironmentDetail, CreateEnvironmentRequest, UpdateEnvironmentRequest } from "../types";

// API client imports
import {
  apiFetchEnvironments,
  apiGetEnvironment,
  apiCreateEnvironment,
  apiUpdateEnvironment,
  apiDeleteEnvironment,
} from "../api/client";

// Component imports
import { Dashboard } from "../pages/Dashboard";

describe("Dashboard Environment Management - Exports", () => {
  test("Environment types are exported correctly", () => {
    // Verify types are importable (compile-time check)
    const env: Environment = {
      id: "test",
      name: "test-env",
      description: null,
      workspace_path: "/tmp",
      agent_name: null,
      status: "idle",
      machine_name: null,
      branch: null,
      last_poll_at: null,
      created_at: 0,
      updated_at: 0,
    };
    expect(env.id).toBe("test");

    const detail: EnvironmentDetail = {
      ...env,
      secret: "env_secret_test",
      capabilities: null,
      worker_type: "acp",
      max_sessions: 1,
    };
    expect(detail.secret).toBe("env_secret_test");

    const createReq: CreateEnvironmentRequest = {
      name: "new-env",
      workspacePath: "/tmp/new",
    };
    expect(createReq.name).toBe("new-env");

    const updateReq: UpdateEnvironmentRequest = {
      description: "updated",
    };
    expect(updateReq.description).toBe("updated");
  });

  test("API client functions are exported", () => {
    expect(typeof apiFetchEnvironments).toBe("function");
    expect(typeof apiGetEnvironment).toBe("function");
    expect(typeof apiCreateEnvironment).toBe("function");
    expect(typeof apiUpdateEnvironment).toBe("function");
    expect(typeof apiDeleteEnvironment).toBe("function");
  });

  test("Dashboard component is a function", () => {
    expect(typeof Dashboard).toBe("function");
  });
});
