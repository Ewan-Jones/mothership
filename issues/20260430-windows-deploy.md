# 部署过程记录（ISSUE）

本文档在部署遇到困难时追加记录，便于后续排查与离线环境交接。

---

## 2026-04-30 — Docker 引擎不可用

**现象**

```text
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
The system cannot find the file specified.
```

**原因（推断）**

- Docker Desktop 未启动，或当前 CLI context `desktop-linux` 对应的 Linux 引擎未就绪。

**建议处理**

1. 启动 **Docker Desktop**，等待托盘图标显示为运行中。
2. 在 PowerShell 执行 `docker ps` 确认无报错后再执行 `docker compose up -d`。
3. 若仍失败，在 Docker Desktop **Settings → General** 确认已启用所需引擎；必要时在终端执行 `docker context ls` 并切换到可用 context。

---

## 2026-04-30 — 镜像导入方式说明

仓库提供的是 **OCI Image Layout**（`oci-layout`、`index.json`、`blobs/sha256`），不是单一的 `docker save` tar。导入到本机 Docker 的常见方式：

1. **Skopeo 容器**（需能拉取 `quay.io/skopeo/stable`，或事先导入该镜像）：

   ```powershell
   cd D:\git\javascript\rcs-amd64
   docker run --rm `
     -v /var/run/docker.sock:/var/run/docker.sock `
     -v ${PWD}:/oci:ro `
     quay.io/skopeo/stable `
     copy oci:/oci docker-daemon:rcs:latest
   ```

2. **已有 tar 包时**（与 README 一致）：`gunzip -c rcs-amd64.tar.gz | docker load`

导入成功后应能看到 `docker images` 中有 `rcs:latest`，再执行 `docker compose up -d`。

---

## 2026-04-30 — Compose 原配置问题（已在本仓库修正）

- 原 `docker-compose.yml` 使用 `build` + `Dockerfile`，但仓库中无 `Dockerfile`，会导致 `docker compose build` 失败。
- 已改为使用预加载镜像 `image: rcs:latest`；部署前务必完成上节镜像导入。

---

## 2026-04-30 — Windows 宿主机挂载

- 为避免依赖 `%USERPROFILE%` 下是否已安装 OpenCode，compose 已改为使用项目内 `deploy/opencode.json` 与 `deploy/skills`。若需使用本机全局配置，可自行把卷改回 `~/.config/opencode/opencode.json` 等路径。

---

## 2026-04-30 — 主机端口 3000 已被占用

**现象**

- 本机已有容器占用 `0.0.0.0:3000`（例如 Langfuse Web），若仍将 RCS 映射为 `3000:3000`，`docker compose up` 会因端口冲突失败。

**处理（已纳入 compose）**

- 将映射改为 `3001:3000`，并把环境变量 `RCS_BASE_URL` 设为 `http://localhost:3001`，与对外访问端口一致。
- 若 3001 仍冲突，可再改端口并同步修改 `RCS_BASE_URL`。

---

## 2026-04-30 — 本次部署结果（记录）

以下在本机执行通过，便于复现：

1. 启动 Docker Desktop 后，`docker ps` 正常。
2. 使用 Skopeo 容器将当前目录 OCI 导入为 `rcs:latest`。
3. `docker compose up -d` 启动容器 `mothership-beta`。
4. `GET http://127.0.0.1:3001/health` 返回 HTTP 200，Docker 健康检查为 `healthy`。

**访问**

- 健康检查：<http://localhost:3001/health>  
- 对外基址（与 `RCS_BASE_URL` 一致）：<http://localhost:3001>

---

1. 模型配置后, agent 侧没有立刻更新
2. 如果中途改动 agent 配置, 智能体不会更新, 需要重启实例
