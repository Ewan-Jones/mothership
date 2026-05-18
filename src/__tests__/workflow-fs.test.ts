import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdir, rm, exists } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ensureWorkflowDir,
  writeYamlFile,
  readYamlFile,
  listRecoverable,
  buildStoragePath,
} from "../services/workflow/workflow-fs";

let testRoot: string;

beforeEach(async () => {
  testRoot = join(tmpdir(), `wf-fs-test-${Date.now()}`);
  await mkdir(testRoot, { recursive: true });
});

afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
});

describe("workflow-fs", () => {
  // buildStoragePath 拼接正确路径
  test("buildStoragePath returns correct path", () => {
    const path = buildStoragePath(testRoot, "team-1", "wf-abc");
    expect(path).toBe(join(testRoot, "team-1", "wf-abc"));
  });

  // ensureWorkflowDir 创建目录
  test("ensureWorkflowDir creates directory", async () => {
    const dir = buildStoragePath(testRoot, "team-1", "wf-abc");
    await ensureWorkflowDir(dir);
    expect(await exists(dir)).toBe(true);
  });

  // writeYamlFile + readYamlFile 写读一致
  test("writeYamlFile + readYamlFile roundtrip", async () => {
    const dir = buildStoragePath(testRoot, "team-1", "wf-abc");
    await ensureWorkflowDir(dir);
    const yaml = 'schema_version: "1"\nname: test\n';
    await writeYamlFile(dir, "draft.yaml", yaml);
    const content = await readYamlFile(dir, "draft.yaml");
    expect(content).toBe(yaml);
  });

  // readYamlFile 文件不存在返回 null
  test("readYamlFile returns null when file not found", async () => {
    const dir = buildStoragePath(testRoot, "team-1", "wf-abc");
    await ensureWorkflowDir(dir);
    const content = await readYamlFile(dir, "draft.yaml");
    expect(content).toBeNull();
  });

  // listRecoverable 返回文件存在但不在排除列表中的目录
  test("listRecoverable returns orphaned directories", async () => {
    const dir1 = buildStoragePath(testRoot, "team-1", "wf-exists");
    const dir2 = buildStoragePath(testRoot, "team-1", "wf-orphan");
    await ensureWorkflowDir(dir1);
    await ensureWorkflowDir(dir2);
    await writeYamlFile(dir1, "draft.yaml", "name: exists\n");
    await writeYamlFile(dir2, "draft.yaml", "name: orphan\n");

    const result = await listRecoverable(testRoot, "team-1", new Set(["wf-exists"]));
    expect(result).toEqual(["wf-orphan"]);
  });
});
