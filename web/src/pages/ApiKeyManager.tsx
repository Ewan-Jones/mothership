import { useState, useEffect, useCallback } from "react";
import { apiFetchApiKeys, apiCreateApiKey, apiDeleteApiKey, apiUpdateApiKeyLabel } from "../api/client";

interface ApiKeyInfo {
  id: string;
  label: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt: number | null;
}

interface ApiKeyManagerProps {
  onBack: () => void;
}

export function ApiKeyManager({ onBack }: ApiKeyManagerProps) {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState("");

  const loadKeys = useCallback(async () => {
    try {
      const data = await apiFetchApiKeys();
      setKeys(data);
    } catch (err) {
      setError("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    setError("");
    try {
      const result = await apiCreateApiKey(newLabel);
      setCreatedKey(result.full_key);
      setNewLabel("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create key");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDeleteApiKey(id);
      await loadKeys();
    } catch {
      setError("Failed to delete key");
    }
  };

  const handleUpdateLabel = async (id: string) => {
    try {
      await apiUpdateApiKeyLabel(id, editLabel);
      setEditingId(null);
      await loadKeys();
    } catch {
      setError("Failed to update label");
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        Loading...
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <div className="mb-6 flex items-center gap-3">
          <button onClick={onBack} className="text-text-muted hover:text-text-primary text-sm">
            &larr; Back
          </button>
          <h1 className="text-lg font-semibold text-text-primary">API Keys</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {createdKey && (
          <div className="mb-4 rounded-md border border-status-warning/30 bg-status-warning/5 px-4 py-3">
            <p className="text-sm font-medium text-text-primary">API Key Created</p>
            <p className="mt-1 text-xs text-text-muted">
              Copy this key now. You won't be able to see it again.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded bg-surface-0 px-3 py-2 text-xs font-mono break-all">
                {createdKey}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdKey);
                }}
                className="shrink-0 rounded-md bg-surface-2 px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-3"
              >
                Copy
              </button>
            </div>
            <button
              onClick={() => setCreatedKey(null)}
              className="mt-2 text-xs text-text-muted hover:text-text-primary"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Create new key */}
        <div className="mb-6 rounded-lg border border-border bg-surface-1 p-4">
          <h2 className="mb-3 text-sm font-medium text-text-primary">Create New Key</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (optional)"
              className="flex-1 rounded-md border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <button
              onClick={handleCreate}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
            >
              Create
            </button>
          </div>
        </div>

        {/* Key list */}
        <div className="space-y-2">
          {keys.length === 0 && (
            <p className="text-center text-sm text-text-muted py-8">
              No API keys yet. Create one above to connect your agents.
            </p>
          )}
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                {editingId === key.id ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="flex-1 rounded border border-border bg-surface-0 px-2 py-1 text-sm text-text-primary"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateLabel(key.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdateLabel(key.id)}
                      className="text-xs text-brand hover:underline"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-xs text-text-muted hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-text-primary truncate">
                      {key.label || "Unnamed"}
                    </p>
                    <p className="text-xs text-text-muted font-mono">{key.keyPrefix}</p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {editingId !== key.id && (
                  <>
                    <button
                      onClick={() => { setEditingId(key.id); setEditLabel(key.label); }}
                      className="text-xs text-text-muted hover:text-text-primary"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(key.id)}
                      className="text-xs text-status-error hover:underline"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
