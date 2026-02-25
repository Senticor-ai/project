import { useState } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/Icon";
import { getMessage } from "@/lib/messages";
import type { PersonItem, OrgRole } from "@/model/types";
import type { CanonicalId } from "@/model/canonical-id";

export interface PersonRowProps {
  item: PersonItem;
  onArchive: (id: CanonicalId) => void;
  onSelect: (id: CanonicalId) => void;
  className?: string;
}

const ORG_ROLE_KEYS: Record<OrgRole, string> = {
  member: "person.role.member",
  founder: "person.role.founder",
  accountant: "person.role.accountant",
  advisor: "person.role.advisor",
  interest: "person.role.interest",
};

const ORG_ROLE_COLORS: Record<OrgRole, string> = {
  member: "bg-paper-200 text-ink-600",
  founder: "bg-blueprint-100 text-blueprint-700",
  accountant: "bg-amber-100 text-amber-700",
  advisor: "bg-emerald-100 text-emerald-700",
  interest: "bg-paper-200 text-ink-500",
};

function getRoleLabel(role: string | undefined): string {
  if (!role) return "";
  const key = ORG_ROLE_KEYS[role as OrgRole];
  return key ? getMessage(key) : role;
}

function getRoleColor(role: string | undefined): string {
  if (!role) return "bg-paper-200 text-ink-500";
  return ORG_ROLE_COLORS[role as OrgRole] ?? "bg-paper-200 text-ink-500";
}

export function PersonRow({
  item,
  onArchive,
  onSelect,
  className,
}: PersonRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = item.name ?? "Unnamed person";

  return (
    <div className={cn(className)}>
      <div
        data-copilot-item="true"
        data-copilot-item-id={item.id}
        data-copilot-item-type="person"
        data-copilot-item-bucket="reference"
        data-copilot-item-name={displayName}
        className={cn(
          "group flex items-start gap-2 rounded-[var(--radius-md)] px-2 py-1.5",
          "transition-colors duration-[var(--duration-fast)]",
          "hover:bg-paper-100",
        )}
      >
        {/* Person icon */}
        <Icon
          name="person"
          className="mt-0.5 shrink-0 text-[16px] text-blueprint-500"
        />

        {/* Main content */}
        <div className="min-w-0 flex-1">
          {/* Name row — button for select, badges as non-interactive children */}
          <button
            className="w-full text-left"
            onClick={() => onSelect(item.id)}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-ink-900">
                {displayName}
              </span>

              {/* Role badge */}
              {item.orgRole && (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
                    getRoleColor(item.orgRole),
                  )}
                >
                  {getRoleLabel(item.orgRole)}
                </span>
              )}

              {/* Org badge */}
              {item.orgRef && (
                <span className="shrink-0 rounded-full bg-paper-200 px-2 py-0.5 text-[11px] text-ink-500">
                  {item.orgRef.name}
                </span>
              )}
            </div>
          </button>

          {/* Contact info — outside button to avoid nested-interactive */}
          {(item.jobTitle || item.email || item.telephone) && (
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-400">
              {item.jobTitle && (
                <span className="truncate">{item.jobTitle}</span>
              )}
              {item.email && (
                <a
                  href={`mailto:${item.email}`}
                  className="text-blueprint-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.email}
                </a>
              )}
              {item.telephone && (
                <a
                  href={`tel:${item.telephone}`}
                  className="text-blueprint-600 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {item.telephone}
                </a>
              )}
            </div>
          )}
        </div>

        {/* Actions menu */}
        <div className="relative shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            aria-label="Person actions"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-paper-200"
          >
            <Icon name="more_horiz" className="text-[16px] text-ink-400" />
          </button>

          {menuOpen && (
            <div
              className="absolute right-0 top-7 z-10 min-w-[120px] rounded-[var(--radius-md)] border border-paper-200 bg-paper-50 py-1 shadow-md"
              onMouseLeave={() => setMenuOpen(false)}
            >
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-paper-100"
                onClick={() => {
                  setMenuOpen(false);
                  onArchive(item.id);
                }}
              >
                <Icon name="archive" className="text-[14px]" />
                Archive
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
