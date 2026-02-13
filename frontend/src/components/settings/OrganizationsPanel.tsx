import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import type { OrgResponse } from "@/lib/api-client";

export interface OrganizationsPanelProps {
  organizations?: OrgResponse[];
  isLoading?: boolean;
  onCreateOrg?: (name: string) => void;
  isCreating?: boolean;
  className?: string;
}

export function OrganizationsPanel({
  organizations = [],
  isLoading,
  onCreateOrg,
  isCreating,
  className,
}: OrganizationsPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showForm) inputRef.current?.focus();
  }, [showForm]);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed || !onCreateOrg) return;
    onCreateOrg(trimmed);
    setName("");
    setShowForm(false);
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-text">
          <Icon name="apartment" size={20} />
          Organizations
        </h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Manage organizations for grouping projects and knowledge base
          documents.
        </p>
      </div>

      {/* Organization list */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-4 text-sm text-text-muted">
          <Icon name="progress_activity" size={16} className="animate-spin" />
          Loading organizations...
        </div>
      ) : organizations.length === 0 ? (
        <p className="py-4 text-sm text-text-muted">
          No organizations yet. Create one to group projects and references.
        </p>
      ) : (
        <div className="space-y-1">
          {organizations.map((org) => (
            <div
              key={org.id}
              className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border px-3 py-2"
            >
              <Icon
                name="apartment"
                size={18}
                className="shrink-0 text-blueprint-500"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-text">{org.name}</p>
                <p className="text-xs text-text-subtle">
                  {org.role === "owner" ? "Owner" : org.role} &middot; Created{" "}
                  {new Date(org.created_at).toLocaleDateString()}
                </p>
              </div>
              {org.role === "owner" && (
                <span className="shrink-0 rounded-full bg-blueprint-50 px-2 py-0.5 text-[10px] font-medium text-blueprint-700">
                  Owner
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add organization */}
      {onCreateOrg && (
        <div>
          {showForm ? (
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSubmit();
                  }
                  if (e.key === "Escape") {
                    setShowForm(false);
                    setName("");
                  }
                }}
                placeholder="Organization name..."
                aria-label="Organization name"
                className="flex-1 rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!name.trim() || isCreating}
                className="rounded-[var(--radius-md)] bg-blueprint-500 px-3 py-1 text-xs text-white disabled:opacity-40"
              >
                {isCreating ? "Creating..." : "Create"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setName("");
                }}
                className="rounded-[var(--radius-md)] px-2 py-1 text-xs text-text-muted hover:bg-paper-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 text-xs text-blueprint-600 hover:text-blueprint-700"
            >
              <Icon name="add" size={16} />
              Add organization
            </button>
          )}
        </div>
      )}
    </div>
  );
}
