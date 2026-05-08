import { db, sqlite } from "../db";
import { channelBinding } from "../db/schema";
import { eq, and } from "drizzle-orm";

// --- Types ---

export interface ChannelBinding {
  id: string;
  platform: string;
  chatId: string | null;
  agentId: string;
  enabled: boolean;
}

export interface CreateBindingInput {
  platform: string;
  chatId?: string | null;
  agentId: string;
  enabled?: boolean;
}

export interface BindingMatchResult {
  binding: ChannelBinding;
  matchType: "exact" | "wildcard";
}

// --- ID Generation ---

function generateBindingId(): string {
  const uuid = crypto.randomUUID();
  return "bind_" + uuid.replace(/-/g, "");
}

// --- CRUD ---

export async function listBindings(): Promise<ChannelBinding[]> {
  const rows = db.select().from(channelBinding).all();
  return rows.map(rowToBinding);
}

export async function getBinding(id: string): Promise<ChannelBinding | undefined> {
  const row = db.select().from(channelBinding).where(eq(channelBinding.id, id)).get();
  return row ? rowToBinding(row) : undefined;
}

export async function createBinding(data: CreateBindingInput): Promise<ChannelBinding> {
  const id = generateBindingId();
  const now = new Date();
  db.insert(channelBinding).values({
    id,
    platform: data.platform,
    chatId: data.chatId ?? null,
    agentId: data.agentId,
    enabled: data.enabled ?? true,
    createdAt: now,
    updatedAt: now,
  }).run();
  return { id, platform: data.platform, chatId: data.chatId ?? null, agentId: data.agentId, enabled: data.enabled ?? true };
}

export async function deleteBinding(id: string): Promise<boolean> {
  db.delete(channelBinding).where(eq(channelBinding.id, id)).run();
  const result = sqlite.prepare("SELECT changes() as c").get() as any;
  return result.c > 0;
}

export async function updateBinding(
  id: string,
  data: Partial<Pick<ChannelBinding, "platform" | "chatId" | "agentId" | "enabled">>,
): Promise<ChannelBinding | undefined> {
  const existing = db.select().from(channelBinding).where(eq(channelBinding.id, id)).get();
  if (!existing) return undefined;
  db.update(channelBinding)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(channelBinding.id, id))
    .run();
  return getBinding(id);
}

// --- Message Matching ---

export async function findBindingForMessage(
  platform: string,
  chatId: string,
): Promise<BindingMatchResult | undefined> {
  const rows = db.select().from(channelBinding)
    .where(and(eq(channelBinding.platform, platform), eq(channelBinding.enabled, true)))
    .all()
    .map(rowToBinding);

  const exact = rows.find((b) => b.chatId === chatId);
  if (exact) return { binding: exact, matchType: "exact" };

  const wildcard = rows.find((b) => b.chatId === null);
  if (wildcard) return { binding: wildcard, matchType: "wildcard" };

  return undefined;
}

// --- Helper ---

function rowToBinding(row: typeof channelBinding.$inferSelect): ChannelBinding {
  return {
    id: row.id,
    platform: row.platform,
    chatId: row.chatId ?? null,
    agentId: row.agentId,
    enabled: row.enabled,
  };
}
