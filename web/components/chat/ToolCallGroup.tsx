import { useState } from "react";
import type { ToolCallEntry, ToolCallData } from "../../src/lib/types";
import { cn } from "../../src/lib/utils";
import { ToolPermissionButtons } from "../ai-elements/permission-request";

// =============================================================================
// 工具调用表格式列表 — 无折叠，始终展开，类似 table 的 row list
// =============================================================================

interface ToolCallGroupProps {
  entries: ToolCallEntry[];
  onPermissionRespond?: (requestId: string, optionId: string | null, optionKind: string | null) => void;
}

export function ToolCallGroup({ entries, onPermissionRespond }: ToolCallGroupProps) {
  if (entries.length === 0) return null;

  return (
    <div className="pl-10">
      {/* 表头 */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
          工具调用
        </span>
        <span className="text-[10px] text-text-dim font-mono tabular-nums">
          ({entries.length})
        </span>
      </div>

      {/* 表格式列表 */}
      <div className="rounded-lg border border-border bg-surface-2/50 overflow-hidden">
        <div className="divide-y divide-border">
          {/* 行 */}
          {entries.map((entry, i) => (
            <ToolCallRow
              key={entry.toolCall.id || i}
              tool={entry.toolCall}
              onPermissionRespond={onPermissionRespond}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 单行工具调用 — table row style, always visible
// =============================================================================

interface ToolCallRowProps {
  tool: ToolCallData;
  onPermissionRespond?: (requestId: string, optionId: string | null, optionKind: string | null) => void;
}

const STATUS_CONFIG = {
  running: { icon: "▶", label: "执行中", cls: "text-status-running", bar: "bg-status-running" },
  complete: { icon: "✓", label: "完成", cls: "text-status-active", bar: "bg-status-active" },
  error: { icon: "✗", label: "失败", cls: "text-status-error", bar: "bg-status-error" },
  waiting_for_confirmation: { icon: "⚑", label: "待确认", cls: "text-brand", bar: "bg-brand" },
  canceled: { icon: "—", label: "已取消", cls: "text-text-muted", bar: "bg-text-muted/40" },
  rejected: { icon: "✗", label: "已拒绝", cls: "text-status-error", bar: "bg-status-error" },
} as const;

function ToolCallRow({ tool, onPermissionRespond }: ToolCallRowProps) {
  const [showDetail, setShowDetail] = useState(false);

  const status = STATUS_CONFIG[tool.status] || STATUS_CONFIG.canceled;
  const toolName = simplifyToolName(tool.title);
  const hasOutput =
    tool.status !== "running" &&
    tool.status !== "waiting_for_confirmation" &&
    (tool.rawOutput || tool.content);
  const description = getDescription(tool);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-3 px-3 py-2 text-xs transition-colors group cursor-pointer",
          "hover:bg-surface-1/70",
        )}
        onClick={() => setShowDetail(!showDetail)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setShowDetail(!showDetail); } }}
      >
        {/* 左侧状态条 — 3px 竖线 */}
        <div className={cn("w-0.5 h-5 rounded-full flex-shrink-0", status.bar)} />

        {/* 状态图标 */}
        <span className={cn("w-4 flex-shrink-0 text-center text-[10px] font-bold", status.cls)}>
          {tool.status === "running" ? (
            <span className="inline-block animate-spin">⟳</span>
          ) : (
            status.icon
          )}
        </span>

        {/* 工具名称 */}
        <span className="w-20 flex-shrink-0 font-mono text-[11px] text-text-primary truncate">
          {toolName}
        </span>

        {/* 详情简述 */}
        <span className="flex-1 min-w-0 text-text-muted truncate text-[11px]">
          {description}
        </span>

        {/* 展开指示 */}
        {hasOutput && (
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={cn(
              "flex-shrink-0 text-text-dim transition-transform",
              showDetail && "rotate-180",
            )}
          >
            <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
        )}
      </div>

      {/* 展开详情行 */}
      {showDetail && hasOutput && (
        <div className="border-t border-border/50 bg-surface-1/30">
          <div className="px-3 py-2 pl-12">
            {tool.rawInput && Object.keys(tool.rawInput).length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">
                  输入
                </div>
                <pre className="text-[11px] bg-surface-1 rounded-md p-2 overflow-x-auto font-mono max-h-36 text-text-secondary">
                  {truncate(JSON.stringify(tool.rawInput, null, 2), 2000)}
                </pre>
              </div>
            )}
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-1">
                输出
              </div>
              <pre
                className={cn(
                  "text-[11px] rounded-md p-2 overflow-x-auto font-mono max-h-36",
                  tool.status === "error"
                    ? "bg-status-error/8 text-status-error"
                    : "bg-surface-1 text-text-secondary",
                )}
              >
                {formatOutput(tool)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* 权限请求按钮 */}
      {tool.status === "waiting_for_confirmation" && tool.permissionRequest && (
        <div className="px-3 pb-2 pl-12">
          <ToolPermissionButtons
            requestId={tool.permissionRequest.requestId}
            options={tool.permissionRequest.options}
            onRespond={onPermissionRespond || (() => {})}
          />
        </div>
      )}
    </div>
  );
}

// =============================================================================
// 工具函数
// =============================================================================

function simplifyToolName(title: string): string {
  const match = title.match(/^(\w+)/);
  return match ? match[1] : title;
}

/** Chip background color per status */
function getDescription(tool: ToolCallData): string {
  if (tool.description && tool.description.length > 0) return tool.description;
  if (tool.rawInput) {
    const str = JSON.stringify(tool.rawInput);
    return truncate(str, 80);
  }
  if (tool.title) {
    // strip common prefixes
    return tool.title.replace(/^(Bash|Edit|Read|Write|Grep|Glob|WebFetch|WebSearch|Task)\s*:\s*/, "");
  }
  return "";
}

function formatOutput(tool: ToolCallData): string {
  if (tool.content && tool.content.length > 0) {
    const texts = tool.content
      .filter((c): c is Extract<typeof c, { type: "content" }> => c.type === "content")
      .filter((c) => c.content.type === "text" && "text" in c.content)
      .map((c) => (c.content as { text: string }).text);
    if (texts.length > 0) return truncate(texts.join("\n"), 2000);
  }
  if (tool.rawOutput && Object.keys(tool.rawOutput).length > 0) {
    return truncate(JSON.stringify(tool.rawOutput, null, 2), 2000);
  }
  return "";
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}
