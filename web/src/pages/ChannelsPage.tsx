import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  apiGetHermesStatus,
  apiListChannelBindings,
  apiCreateChannelBinding,
  apiDeleteChannelBinding,
  apiUpdateChannelBinding,
  apiFetchEnvironments,
} from "../api/client";
import type { HermesStatus, ChannelBinding, Environment } from "../types";
import { DataTable, type Column } from "@/components/config/DataTable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ChannelsPage() {
  const [hermesStatus, setHermesStatus] = useState<HermesStatus | null>(null);
  const [bindings, setBindings] = useState<ChannelBinding[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formPlatform, setFormPlatform] = useState("");
  const [formChatId, setFormChatId] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const loadHermesStatus = useCallback(async () => {
    try {
      const status = await apiGetHermesStatus();
      setHermesStatus(status);
    } catch {
      setHermesStatus(null);
    }
  }, []);

  const loadBindings = useCallback(async () => {
    try {
      const list = await apiListChannelBindings();
      setBindings(list);
    } catch {
      toast.error("加载绑定列表失败");
    }
  }, []);

  const loadEnvironments = useCallback(async () => {
    try {
      const list = await apiFetchEnvironments();
      setEnvironments(list);
    } catch {}
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([loadHermesStatus(), loadBindings(), loadEnvironments()]);
      setLoading(false);
    };
    void loadAll();
  }, [loadHermesStatus, loadBindings, loadEnvironments]);

  // Poll Hermes status every 5s
  useEffect(() => {
    const interval = setInterval(() => {
      void loadHermesStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [loadHermesStatus]);

  const handleToggleBinding = async (binding: ChannelBinding) => {
    try {
      const updated = await apiUpdateChannelBinding(binding.id, {
        enabled: !binding.enabled,
      });
      setBindings((prev) =>
        prev.map((b) => (b.id === updated.id ? updated : b)),
      );
    } catch {
      toast.error("更新绑定状态失败");
    }
  };

  const handleDeleteBinding = async (id: string) => {
    try {
      await apiDeleteChannelBinding(id);
      setBindings((prev) => prev.filter((b) => b.id !== id));
      toast.success("绑定已删除");
    } catch {
      toast.error("删除绑定失败");
    }
  };

  const handleCreateBinding = async () => {
    if (!formPlatform || !formAgentId) {
      toast.error("请选择平台和 Agent");
      return;
    }
    setFormSaving(true);
    try {
      const created = await apiCreateChannelBinding({
        platform: formPlatform,
        chatId: formChatId || null,
        agentId: formAgentId,
      });
      setBindings((prev) => [...prev, created]);
      setDialogOpen(false);
      setFormPlatform("");
      setFormChatId("");
      setFormAgentId("");
      toast.success("绑定创建成功");
    } catch (err) {
      toast.error(
        "创建绑定失败: " + (err instanceof Error ? err.message : "未知错误"),
      );
    } finally {
      setFormSaving(false);
    }
  };

  const columns: Column<ChannelBinding>[] = [
    {
      key: "platform",
      header: "平台",
      sortable: true,
    },
    {
      key: "chatId",
      header: "聊天 ID",
      render: (row) => row.chatId ?? "全部",
    },
    {
      key: "agentName",
      header: "Agent",
      render: (row) => row.agentName ?? row.agentId,
    },
    {
      key: "enabled",
      header: "启用",
      render: (row) => (
        <Switch
          size="sm"
          checked={row.enabled}
          onCheckedChange={() => handleToggleBinding(row)}
        />
      ),
    },
  ];

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-9 w-24" />
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <div className="rounded-md border">
          <Skeleton className="h-10 w-full rounded-t-md" />
          <Skeleton className="h-12 w-full rounded-none border-t" />
          <Skeleton className="h-12 w-full rounded-none border-t" />
        </div>
      </div>
    );
  }

  const statusColor = hermesStatus?.connected
    ? "bg-green-500"
    : hermesStatus?.reconnecting
      ? "bg-yellow-500"
      : "bg-gray-400";

  const statusText = hermesStatus?.connected
    ? "已连接"
    : hermesStatus?.reconnecting
      ? "重连中"
      : "未配置";

  const maskedUrl = hermesStatus?.url
    ? hermesStatus.url.replace(/\/\/.*@/, "//***@")
    : "";

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-text-bright">消息渠道</h2>
        <Button onClick={() => setDialogOpen(true)}>新建绑定</Button>
      </div>

      {/* Hermes Connection Status Card */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${statusColor}`} />
          <span className="text-sm font-medium text-text-bright">
            Hermes Gateway
          </span>
          <Badge variant={hermesStatus?.connected ? "default" : "secondary"}>
            {statusText}
          </Badge>
        </div>
        {hermesStatus && (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
            {hermesStatus.url && <span>地址: {maskedUrl}</span>}
            {hermesStatus.platforms.length > 0 && (
              <span>
                平台: {hermesStatus.platforms.join(", ")}
              </span>
            )}
            {hermesStatus.lastConnectedAt && (
              <span>
                最后连接:{" "}
                {new Date(hermesStatus.lastConnectedAt).toLocaleString("zh-CN")}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bindings Table */}
      <section>
        <DataTable<ChannelBinding>
          columns={columns}
          data={bindings}
          searchable
          searchPlaceholder="搜索绑定..."
          emptyMessage="暂无绑定"
          actions={(row) => (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDeleteBinding(row.id)}
              >
                删除
              </Button>
            </div>
          )}
        />
      </section>

      {/* Create Binding Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建通道绑定</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>平台</Label>
              <Select value={formPlatform} onValueChange={setFormPlatform}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择平台" />
                </SelectTrigger>
                <SelectContent>
                  {hermesStatus?.platforms.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                  {!hermesStatus?.platforms.length && (
                    <SelectItem value="feishu">feishu</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>聊天 ID（可选，留空匹配全部）</Label>
              <Input
                value={formChatId}
                onChange={(e) => setFormChatId(e.target.value)}
                placeholder="如 oc_xxx，留空表示匹配该平台所有消息"
              />
            </div>
            <div className="grid gap-2">
              <Label>Agent</Label>
              <Select value={formAgentId} onValueChange={setFormAgentId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="选择 Agent" />
                </SelectTrigger>
                <SelectContent>
                  {environments.map((env) => (
                    <SelectItem key={env.id} value={env.id}>
                      {env.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDialogOpen(false)}
              disabled={formSaving}
            >
              取消
            </Button>
            <Button onClick={handleCreateBinding} disabled={formSaving}>
              {formSaving ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
