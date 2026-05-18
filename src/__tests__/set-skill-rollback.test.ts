import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { _deps, _resetDeps, setSkill } from "../services/skill";

const mockWriteSkillMd = mock(async () => "/tmp/skills/test-skill/SKILL.md");
const mockDeleteSkillDir = mock(async (_dir: string) => {});
const mockUpsertSkill = mock(async () => "skill_1");

beforeEach(() => {
  mockWriteSkillMd.mockClear();
  mockDeleteSkillDir.mockClear();
  mockUpsertSkill.mockClear();

  _deps.configPg = {
    upsertSkill: mockUpsertSkill,
    deleteSkill: mock(async () => true),
    listSkills: mock(async () => []),
    getSkill: mock(async () => null),
    enableSkill: mock(async () => true),
    disableSkill: mock(async () => true),
  } as any;
  _deps.skillFs = {
    writeSkillMd: mockWriteSkillMd,
    deleteSkillDir: mockDeleteSkillDir,
    createSkillValidationError: (msg: string) => { const e = new Error(msg) as any; e.code = "TEST"; return e; },
    groupUploadFiles: () => new Map(),
    listSkillsFromDir: mock(async () => []),
    readSkillDetailFromMd: mock(async () => null),
    resolveImportPlan: () => ({ pendingEntries: [], skipped: [] }),
    writeImportFiles: mock(async () => []),
    buildImportedSkillInfos: mock(async () => []),
    backupSkillDirs: mock(async () => new Map()),
    cleanupWrittenSkills: mock(async () => {}),
    restoreFromBackup: mock(async () => {}),
    createBackupDir: mock(async () => "/tmp/backup"),
    cleanupBackupDir: mock(async () => {}),
  };
});

afterEach(() => {
  _resetDeps();
});

describe("setSkill partial write rollback", () => {
  // PG upsert 成功时正常返回
  test("returns SkillInfo when PG upsert succeeds", async () => {
    const result = await setSkill({ teamId: "test-team", userId: "user_1", role: "owner" }, "my-skill", {
      description: "desc",
      content: "content",
    });
    expect(result.name).toBe("my-skill");
    expect(result.enabled).toBe(true);
    expect(mockDeleteSkillDir).not.toHaveBeenCalled();
  });

  // PG upsert 失败时回滚文件
  test("cleans up skill directory when PG upsert fails", async () => {
    mockUpsertSkill.mockRejectedValueOnce(new Error("PG connection lost"));

    try {
      await setSkill({ teamId: "test-team", userId: "user_1", role: "owner" }, "broken-skill", {
        description: "desc",
        content: "content",
      });
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect((err as Error).message).toBe("PG connection lost");
      expect(mockDeleteSkillDir).toHaveBeenCalledTimes(1);
      expect(mockDeleteSkillDir.mock.calls[0][0]).toContain("broken-skill");
    }
  });

  // 文件清理也失败时不掩盖原始错误
  test("does not mask original error when file cleanup also fails", async () => {
    mockUpsertSkill.mockRejectedValueOnce(new Error("PG down"));
    mockDeleteSkillDir.mockRejectedValueOnce(new Error("Permission denied"));

    try {
      await setSkill({ teamId: "test-team", userId: "user_1", role: "owner" }, "doom-skill", {
        description: "desc",
        content: "content",
      });
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect((err as Error).message).toBe("PG down");
    }
  });
});
