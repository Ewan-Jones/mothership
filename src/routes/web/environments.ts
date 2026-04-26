import { Hono } from "hono";
import { sessionAuth } from "../../auth/middleware";
import {
    storeCreateEnvironment,
    storeGetEnvironment,
    storeUpdateEnvironment,
    storeListEnvironmentsByUserId,
    storeDeleteEnvironment,
    storeListSessionsByEnvironment,
    storeCreateSession,
} from "../../store";
import { getSection } from "../../services/config";
import { mkdirSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { randomBytes } from "node:crypto";

function generateEnvSecret(): string {
    return `env_secret_${randomBytes(24).toString("hex")}`;
}

const BLOCKED_PATHS = [
    "/",
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/var",
    "/sys",
    "/proc",
    "/dev",
    "/boot",
    "/lib",
    "/root",
];

function validateWorkspacePath(p: string): string | null {
    if (!isAbsolute(p)) return "workspace 路径必须是绝对路径";
    const normalized = resolve(p);
    if (BLOCKED_PATHS.includes(normalized))
        return `不允许使用系统目录: ${normalized}`;
    for (const blocked of BLOCKED_PATHS) {
        if (blocked !== "/" && normalized.startsWith(blocked + "/")) {
            return `不允许使用系统目录下的路径: ${normalized}`;
        }
    }
    return null;
}

function sanitizeResponse(row: any) {
    return {
        id: row.id,
        name: row.name,
        description: row.description ?? null,
        workspace_path: row.workspacePath,
        agent_name: row.agentName ?? null,
        status: row.status,
        machine_name: row.machineName ?? null,
        branch: row.branch ?? null,
        last_poll_at: row.lastPollAt
            ? Math.floor(new Date(row.lastPollAt).getTime() / 1000)
            : null,
        created_at: Math.floor(new Date(row.createdAt).getTime() / 1000),
        updated_at: Math.floor(new Date(row.updatedAt).getTime() / 1000),
    };
}

const app = new Hono();

/** GET /web/environments — List environments for the current user */
app.get("/environments", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const envs = storeListEnvironmentsByUserId(user.id);
    return c.json(envs.map((env) => {
      // Ensure a session exists for each environment
      let sessions = storeListSessionsByEnvironment(env.id);
      if (sessions.length === 0) {
        const session = storeCreateSession({
          environmentId: env.id,
          title: env.agentName || env.name,
          source: "acp",
          userId: user.id,
        });
        sessions = [session];
      }
      return { ...sanitizeResponse(env), session_id: sessions[0].id };
    }), 200);
});

/** POST /web/environments — Register a new environment */
app.post("/environments", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const body = await c.req.json();
    const { name, description, workspacePath, agentName } = body;

    if (!name || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name)) {
        return c.json(
            {
                error: {
                    type: "VALIDATION_ERROR",
                    message:
                        "name 必须为 kebab-case 格式（小写字母、数字、连字符）",
                },
            },
            400,
        );
    }

    if (!workspacePath) {
        return c.json(
            {
                error: {
                    type: "VALIDATION_ERROR",
                    message: "workspacePath 为必填字段",
                },
            },
            400,
        );
    }
    const pathError = validateWorkspacePath(workspacePath);
    if (pathError) {
        return c.json(
            { error: { type: "VALIDATION_ERROR", message: pathError } },
            400,
        );
    }

    if (agentName) {
        const agents =
            (await getSection<Record<string, unknown>>("agent")) ?? {};
        if (!(agentName in agents)) {
            return c.json(
                {
                    error: {
                        type: "VALIDATION_ERROR",
                        message: `Agent '${agentName}' 不存在`,
                    },
                },
                400,
            );
        }
    }

    try {
        mkdirSync(workspacePath, { recursive: true });
    } catch (err: any) {
        return c.json(
            {
                error: {
                    type: "CONFIG_WRITE_ERROR",
                    message: `无法创建目录: ${err.message}`,
                },
            },
            500,
        );
    }

    const secret = generateEnvSecret();
    let record;
    try {
        record = storeCreateEnvironment({
            name,
            description: description ?? null,
            workspacePath,
            agentName: agentName ?? null,
            status: "idle",
            secret,
            userId: user.id,
        });
    } catch (err: any) {
        if (err.message?.includes("UNIQUE constraint failed")) {
            return c.json(
                {
                    error: {
                        type: "VALIDATION_ERROR",
                        message: `环境名称 '${name}' 已存在`,
                    },
                },
                409,
            );
        }
        throw err;
    }

    return c.json(
        {
            ...sanitizeResponse(record),
            secret: record.secret,
        },
        201,
    );
});

/** GET /web/environments/:id — Get environment detail (with secret) */
app.get("/environments/:id", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const envId = c.req.param("id")!;
    const env = storeGetEnvironment(envId);
    if (!env || env.userId !== user.id) {
        return c.json(
            { error: { type: "NOT_FOUND", message: "环境不存在" } },
            404,
        );
    }
    return c.json({ ...sanitizeResponse(env), secret: env.secret }, 200);
});

/** PUT /web/environments/:id — Update environment metadata */
app.put("/environments/:id", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const envId = c.req.param("id")!;
    const env = storeGetEnvironment(envId);
    if (!env || env.userId !== user.id) {
        return c.json(
            { error: { type: "NOT_FOUND", message: "环境不存在" } },
            404,
        );
    }

    const body = await c.req.json();
    const patch: Record<string, unknown> = {};

    if (body.name !== undefined) {
        if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(body.name)) {
            return c.json(
                {
                    error: {
                        type: "VALIDATION_ERROR",
                        message: "name 必须为 kebab-case 格式",
                    },
                },
                400,
            );
        }
        patch.name = body.name;
    }
    if (body.workspacePath !== undefined) {
        const pathError = validateWorkspacePath(body.workspacePath);
        if (pathError) {
            return c.json(
                { error: { type: "VALIDATION_ERROR", message: pathError } },
                400,
            );
        }
        mkdirSync(body.workspacePath, { recursive: true });
        patch.workspacePath = body.workspacePath;
    }
    if (body.agentName !== undefined) {
        if (body.agentName) {
            const agents =
                (await getSection<Record<string, unknown>>("agent")) ?? {};
            if (!(body.agentName in agents)) {
                return c.json(
                    {
                        error: {
                            type: "VALIDATION_ERROR",
                            message: `Agent '${body.agentName}' 不存在`,
                        },
                    },
                    400,
                );
            }
        }
        patch.agentName = body.agentName || null;
    }
    if (body.description !== undefined) {
        patch.description = body.description;
    }

    storeUpdateEnvironment(envId, patch);
    const updated = storeGetEnvironment(envId);
    return c.json(sanitizeResponse(updated), 200);
});

/** DELETE /web/environments/:id — Delete environment */
app.delete("/environments/:id", sessionAuth, async (c) => {
    const user = c.get("user")!;
    const envId = c.req.param("id")!;
    const env = storeGetEnvironment(envId);
    if (!env || env.userId !== user.id) {
        return c.json(
            { error: { type: "NOT_FOUND", message: "环境不存在" } },
            404,
        );
    }
    storeDeleteEnvironment(envId);
    return c.json({ ok: true }, 200);
});

export default app;
