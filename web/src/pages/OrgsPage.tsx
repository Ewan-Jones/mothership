import { Plus, Shield, ShieldCheck, Trash2, User, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { useOrg } from "../contexts/OrgContext";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface OrgMember {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string; image?: string };
}

interface OrgDetail {
  id: string;
  name: string;
  slug: string;
  logo?: string;
  members: OrgMember[];
}

/* ------------------------------------------------------------------ */
/*  API helper                                                         */
/* ------------------------------------------------------------------ */

async function orgApi<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch("/web/organizations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "操作失败");
  return json.data as T;
}

/* ------------------------------------------------------------------ */
/*  Role helpers                                                       */
/* ------------------------------------------------------------------ */

const ROLE_LABELS: Record<string, string> = {
  owner: "拥有者",
  admin: "管理员",
  member: "成员",
};

function RoleBadge({ role }: { role: string }) {
  const variant = role === "owner" ? "default" : role === "admin" ? "secondary" : "outline";
  return <Badge variant={variant}>{ROLE_LABELS[role] || role}</Badge>;
}

function RoleIcon({ role }: { role: string }) {
  if (role === "owner") return <Shield className="w-3.5 h-3.5 text-yellow-500" />;
  if (role === "admin") return <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />;
  return <User className="w-3.5 h-3.5 text-text-dim" />;
}

/* ------------------------------------------------------------------ */
/*  Slug generator                                                     */
/* ------------------------------------------------------------------ */

function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function OrgsPage() {
  const { org: currentOrg, role: currentRole, refreshOrgs } = useOrg();

  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [loading, setLoading] = useState(false);

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberEmail, setAddMemberEmail] = useState("");
  const [addMemberRole, setAddMemberRole] = useState("member");
  const [addMemberSaving, setAddMemberSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);

  // Edit org name
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Load my orgs list
  const [myOrgs, setMyOrgs] = useState<{ id: string; name: string; slug: string; role: string }[]>([]);

  const loadMyOrgs = useCallback(async () => {
    try {
      const list = await orgApi<{ id: string; name: string; slug: string; role: string }[]>({ action: "list" });
      setMyOrgs(list);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    loadMyOrgs();
  }, [loadMyOrgs]);

  // Auto-select current org
  useEffect(() => {
    if (!selectedOrgId && currentOrg?.id) {
      setSelectedOrgId(currentOrg.id);
    }
  }, [selectedOrgId, currentOrg]);

  // Load org detail when selection changes
  useEffect(() => {
    if (!selectedOrgId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    orgApi<OrgDetail>({ action: "get", organizationId: selectedOrgId })
      .then((d) => {
        setDetail(d);
      })
      .catch((err) => {
        console.error(err);
        toast.error("加载组织详情失败");
      })
      .finally(() => setLoading(false));
  }, [selectedOrgId]);

  const canManage = currentRole === "owner" || currentRole === "admin";
  const isOwner = currentRole === "owner";

  // --- Create org ---
  const handleCreate = async () => {
    if (!formName.trim()) return;
    setFormSaving(true);
    try {
      const t = await orgApi<{ id: string }>({
        action: "create",
        name: formName.trim(),
        slug: formSlug || nameToSlug(formName),
        description: formDesc.trim() || undefined,
      });
      toast.success("组织创建成功");
      setCreateOpen(false);
      setFormName("");
      setFormSlug("");
      setFormDesc("");
      await loadMyOrgs();
      await refreshOrgs();
      setSelectedOrgId(t.id);
    } catch (err) {
      console.error(err);
      toast.error("创建组织失败");
    } finally {
      setFormSaving(false);
    }
  };

  // --- Update org info ---
  const handleSaveEdit = async () => {
    if (!selectedOrgId || !editName.trim()) return;
    setEditSaving(true);
    try {
      await orgApi({
        action: "update",
        organizationId: selectedOrgId,
        data: { name: editName.trim() },
      });
      toast.success("组织信息已更新");
      setEditingName(false);
      setDetail((d) => (d ? { ...d, name: editName.trim() } : d));
      await loadMyOrgs();
      await refreshOrgs();
    } catch (err) {
      console.error(err);
      toast.error("更新失败");
    } finally {
      setEditSaving(false);
    }
  };

  // --- Add member (invite) ---
  const handleAddMember = async () => {
    if (!selectedOrgId || !addMemberEmail.trim()) return;
    setAddMemberSaving(true);
    try {
      await orgApi({
        action: "add-member",
        organizationId: selectedOrgId,
        email: addMemberEmail.trim(),
        role: addMemberRole,
      });
      toast.success("邀请已发送");
      setAddMemberOpen(false);
      setAddMemberEmail("");
      // Reload detail
      const d = await orgApi<OrgDetail>({ action: "get", organizationId: selectedOrgId });
      setDetail(d);
    } catch (err) {
      console.error(err);
      toast.error("邀请成员失败");
    } finally {
      setAddMemberSaving(false);
    }
  };

  // --- Remove member ---
  const handleRemoveMember = async (userId: string) => {
    if (!selectedOrgId) return;
    try {
      await orgApi({ action: "remove-member", organizationId: selectedOrgId, userId });
      toast.success("成员已移除");
      const d = await orgApi<OrgDetail>({ action: "get", organizationId: selectedOrgId });
      setDetail(d);
    } catch (err) {
      console.error(err);
      toast.error("移除成员失败");
    }
  };

  // --- Update role ---
  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!selectedOrgId) return;
    try {
      await orgApi({ action: "update-role", organizationId: selectedOrgId, userId, role: newRole });
      toast.success("角色已更新");
      const d = await orgApi<OrgDetail>({ action: "get", organizationId: selectedOrgId });
      setDetail(d);
    } catch (err) {
      console.error(err);
      toast.error("更新角色失败");
    }
  };

  // --- Delete org ---
  const handleDeleteOrg = async () => {
    if (!selectedOrgId) return;
    setDeleteSaving(true);
    try {
      await orgApi({ action: "delete", organizationId: selectedOrgId });
      toast.success("组织已删除");
      setDeleteOpen(false);
      setSelectedOrgId(null);
      setDetail(null);
      await loadMyOrgs();
      await refreshOrgs();
    } catch (err) {
      console.error(err);
      toast.error("删除组织失败");
    } finally {
      setDeleteSaving(false);
    }
  };

  const members = detail?.members ?? [];

  /* ---- Render ---- */

  return (
    <div className="flex h-full">
      {/* Left panel: org list */}
      <div className="w-[260px] border-r border-border-subtle flex flex-col bg-surface-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-text-bright">我的组织</h2>
          <Button variant="ghost" size="sm" onClick={() => setCreateOpen(true)} className="h-7 w-7 p-0">
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {myOrgs.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedOrgId(o.id)}
              className={[
                "flex items-center gap-2 w-full px-4 py-2.5 text-left text-sm",
                "transition-colors duration-100",
                o.id === selectedOrgId
                  ? "bg-brand-subtle text-brand-light font-medium"
                  : "text-text-secondary hover:bg-surface-hover",
              ].join(" ")}
            >
              <RoleIcon role={o.role} />
              <span className="truncate">{o.name}</span>
              <span className="ml-auto text-[11px] text-text-dim">{ROLE_LABELS[o.role]}</span>
            </button>
          ))}
          {myOrgs.length === 0 && <p className="px-4 py-6 text-sm text-text-dim text-center">暂无组织</p>}
        </div>
      </div>

      {/* Right panel: org detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
          </div>
        )}

        {!loading && !detail && (
          <div className="flex flex-col items-center justify-center h-64 text-text-dim">
            <p className="text-sm">选择一个组织查看详情</p>
          </div>
        )}

        {!loading && detail && (
          <div className="max-w-[720px] mx-auto space-y-6">
            {/* Org info */}
            <div className="space-y-3">
              {editingName ? (
                <div className="space-y-3">
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="组织名称" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveEdit} disabled={editSaving}>
                      {editSaving ? "保存中..." : "保存"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingName(false)}>
                      取消
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div>
                    <h1 className="text-xl font-bold text-text-bright">{detail.name}</h1>
                    <p className="text-sm text-text-dim mt-0.5">{detail.slug}</p>
                  </div>
                  {canManage && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditName(detail.name);
                        setEditingName(true);
                      }}
                    >
                      编辑
                    </Button>
                  )}
                </div>
              )}
            </div>

            {/* Members section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">成员 ({members.length})</h2>
                {canManage && (
                  <Button size="sm" variant="outline" onClick={() => setAddMemberOpen(true)}>
                    <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                    邀请成员
                  </Button>
                )}
              </div>

              <div className="rounded-lg border border-border-subtle overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-1 text-text-dim">
                      <th className="text-left px-4 py-2.5 font-medium">用户</th>
                      <th className="text-left px-4 py-2.5 font-medium">角色</th>
                      <th className="text-right px-4 py-2.5 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-t border-border-subtle hover:bg-surface-hover">
                        <td className="px-4 py-2.5">
                          <div>
                            <p className="font-medium text-text-primary">{m.user?.name || m.userId}</p>
                            <p className="text-xs text-text-dim">{m.user?.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <RoleBadge role={m.role} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isOwner && m.role !== "owner" && (
                              <select
                                value={m.role}
                                onChange={(e) => handleUpdateRole(m.userId, e.target.value)}
                                className="text-xs border border-border-subtle rounded px-1.5 py-0.5 bg-transparent text-text-secondary"
                              >
                                <option value="admin">管理员</option>
                                <option value="member">成员</option>
                              </select>
                            )}
                            {canManage && m.role !== "owner" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-text-dim hover:text-destructive"
                                onClick={() => handleRemoveMember(m.userId)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {members.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-text-dim">
                          暂无成员
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Danger zone */}
            {isOwner && (
              <div className="pt-4 border-t border-border-subtle">
                <h3 className="text-sm font-semibold text-destructive mb-2">危险区域</h3>
                <p className="text-sm text-text-dim mb-3">删除组织将同时删除所有关联资源，此操作不可撤销。</p>
                <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  删除组织
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create org dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建组织</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-text-primary">名称</label>
              <Input
                className="mt-1"
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  if (!formSlug || formSlug === nameToSlug(formName)) {
                    setFormSlug(nameToSlug(e.target.value));
                  }
                }}
                placeholder="组织名称"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary">Slug</label>
              <Input
                className="mt-1"
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
                placeholder="url-identifier"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary">描述</label>
              <Input
                className="mt-1"
                value={formDesc}
                onChange={(e) => setFormDesc(e.target.value)}
                placeholder="可选"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreate} disabled={formSaving || !formName.trim()}>
              {formSaving ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add member dialog */}
      <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>邀请成员</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-text-primary">邮箱</label>
              <Input
                className="mt-1"
                value={addMemberEmail}
                onChange={(e) => setAddMemberEmail(e.target.value)}
                placeholder="输入邮箱地址"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-text-primary">角色</label>
              <select
                value={addMemberRole}
                onChange={(e) => setAddMemberRole(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="admin">管理员</option>
                <option value="member">成员</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddMemberOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddMember} disabled={addMemberSaving || !addMemberEmail.trim()}>
              {addMemberSaving ? "邀请中..." : "邀请"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete org confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除组织</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除组织「{detail?.name}」，所有关联资源将被永久删除。此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrg}
              disabled={deleteSaving}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteSaving ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
