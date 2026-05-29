import { describe, expect, test } from "bun:test";

describe("i18n 翻译 keys", () => {
  test("en agents.json 包含 machine keys", async () => {
    const en = await import("../i18n/locales/en/agents.json");
    const form = en.form as Record<string, string>;
    expect(form.machine).toBeTruthy();
    expect(form.machinePlaceholder).toBeTruthy();
    expect(form.machineValidationError).toBeTruthy();
  });

  test("zh agents.json 包含 machine keys", async () => {
    const zh = await import("../i18n/locales/zh/agents.json");
    const form = zh.form as Record<string, string>;
    expect(form.machine).toBeTruthy();
    expect(form.machinePlaceholder).toBeTruthy();
    expect(form.machineValidationError).toBeTruthy();
  });
});
