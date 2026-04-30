import { useState, useEffect, useCallback } from "react";
import { apiFetchEnvironments, apiFetchAllSessions, apiListAgents, apiGetModels, apiListSkills, apiListMcpServers, apiListTasks } from "../api/client";
import type { Environment, Session } from "../types";
import type { AgentInfo } from "../types/config";
import { Cpu, Bot, Wrench, Plug, Clock, Activity, Monitor, MessageSquare, type LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";

interface StatsState {
  environments: Environment[];
  sessions: Session[];
  agents: AgentInfo[];
  models: { available: { fullId: string }[] } | null;
  skills: { name: string; enabled: boolean }[];
  mcpServers: { name: string; enabled: boolean }[];
  tasks: { id: string; enabled: boolean; lastStatus: string | null }[];
  loading: boolean;
}

function useStats() {
  const [state, setState] = useState<StatsState>({
    environments: [],
    sessions: [],
    agents: [],
    models: null,
    skills: [],
    mcpServers: [],
    tasks: [],
    loading: true,
  });

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      apiFetchEnvironments(),
      apiFetchAllSessions(),
      apiListAgents(),
      apiGetModels(),
      apiListSkills(),
      apiListMcpServers(),
      apiListTasks(),
    ]);
    setState({
      environments: results[0].status === "fulfilled" ? results[0].value ?? [] : [],
      sessions: results[1].status === "fulfilled" ? results[1].value ?? [] : [],
      agents: results[2].status === "fulfilled" ? results[2].value.agents : [],
      models: results[3].status === "fulfilled" ? results[3].value : null,
      skills: results[4].status === "fulfilled" ? results[4].value ?? [] : [],
      mcpServers: results[5].status === "fulfilled" ? results[5].value ?? [] : [],
      tasks: results[6].status === "fulfilled" ? results[6].value ?? [] : [],
      loading: false,
    });
  }, []);

  useEffect(() => { load(); }, [load]);
  return state;
}

// =============================================================================
// Dashboard: 统计总览
// =============================================================================

export function Dashboard() {
  const stats = useStats();

  if (stats.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-text-muted">加载中...</div>
      </div>
    );
  }

  const activeEnvs = stats.environments.filter(e =>
    e.instance_status === "running" || e.instance_status === "starting"
  );
  const activeSessions = stats.sessions.filter(s =>
    s.status === "active" || s.status === "running"
  );
  const enabledSkills = stats.skills.filter(s => s.enabled);
  const enabledMcp = stats.mcpServers.filter(m => m.enabled);
  const enabledTasks = stats.tasks.filter(t => t.enabled);
  const modelCount = stats.models?.available?.length ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <h1 className="mb-6 text-lg font-semibold text-text-primary">概览</h1>

        {/* KPI 卡片行 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <KpiCard
            icon={Monitor}
            label="智能体"
            value={stats.environments.length}
            sub={`${activeEnvs.length} 活跃`}
            accent="text-blue-500"
            accentBg="bg-blue-500/10"
          />
          <KpiCard
            icon={MessageSquare}
            label="会话"
            value={stats.sessions.length}
            sub={`${activeSessions.length} 进行中`}
            accent="text-emerald-500"
            accentBg="bg-emerald-500/10"
          />
          <KpiCard
            icon={Cpu}
            label="模型"
            value={modelCount}
            sub="已配置"
            accent="text-violet-500"
            accentBg="bg-violet-500/10"
          />
          <KpiCard
            icon={Activity}
            label="定时任务"
            value={stats.tasks.length}
            sub={`${enabledTasks.length} 启用`}
            accent="text-amber-500"
            accentBg="bg-amber-500/10"
          />
        </div>

        {/* 两栏布局 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 智能体状态分布 */}
          <StatCard title="智能体状态" icon={Bot}>
            <div className="space-y-2">
              <StatRow label="总数" value={stats.environments.length} />
              <StatRow label="活跃" value={activeEnvs.length} dot="bg-green-500" />
              <StatRow label="离线" value={stats.environments.length - activeEnvs.length} dot="bg-gray-400" />
            </div>
          </StatCard>

          {/* 配置概览 */}
          <StatCard title="配置概览" icon={Wrench}>
            <div className="space-y-2">
              <StatRow label="Agent" value={stats.agents.length} />
              <StatRow
                label="Skills"
                value={`${enabledSkills.length} / ${stats.skills.length}`}
                sub="已启用 / 总数"
              />
              <StatRow
                label="MCP 服务器"
                value={`${enabledMcp.length} / ${stats.mcpServers.length}`}
                sub="已启用 / 总数"
              />
              <StatRow
                label="定时任务"
                value={`${enabledTasks.length} / ${stats.tasks.length}`}
                sub="已启用 / 总数"
              />
            </div>
          </StatCard>

          {/* 最近会话 */}
          <StatCard title="会话摘要" icon={MessageSquare}>
            <div className="space-y-2">
              <StatRow label="总会话数" value={stats.sessions.length} />
              <StatRow label="进行中" value={activeSessions.length} dot="bg-green-500" />
              <StatRow
                label="已完成/归档"
                value={stats.sessions.filter(s => s.status === "archived" || s.status === "complete").length}
                dot="bg-gray-400"
              />
            </div>
          </StatCard>

          {/* 快速导航 */}
          <StatCard title="快速操作" icon={Activity}>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">模型</span>
                <span className="text-text-primary font-mono">{modelCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">Agent 配置</span>
                <span className="text-text-primary font-mono">{stats.agents.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">可用 Skills</span>
                <span className="text-text-primary font-mono">{enabledSkills.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">MCP 连接</span>
                <span className="text-text-primary font-mono">{enabledMcp.length}</span>
              </div>
            </div>
          </StatCard>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// 子组件
// =============================================================================

function KpiCard({ icon: Icon, label, value, sub, accent, accentBg }: {
  icon: LucideIcon;
  label: string;
  value: number;
  sub: string;
  accent: string;
  accentBg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4 transition-shadow hover:shadow-sm">
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("rounded-lg p-1.5", accentBg)}>
          <Icon className={cn("h-4 w-4", accent)} />
        </div>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <div className={cn("text-2xl font-bold font-mono", accent)}>{value}</div>
      <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>
    </div>
  );
}

function StatCard({ title, icon: Icon, children }: {
  title: string;
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-text-dim" />
        <span className="text-xs font-semibold uppercase tracking-wider text-text-dim">{title}</span>
      </div>
      {children}
    </div>
  );
}

function StatRow({ label, value, sub, dot }: {
  label: string;
  value: string | number;
  sub?: string;
  dot?: string;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        {dot && <span className={cn("inline-block h-2 w-2 rounded-full", dot)} />}
        <span className="text-text-muted">{label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-text-primary">{value}</span>
        {sub && <span className="text-[10px] text-text-dim">{sub}</span>}
      </div>
    </div>
  );
}
